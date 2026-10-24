const readline = require('node:readline/promises');
const { stdin, stdout } = require('node:process');

const questions = [
  {
    category: 'Science',
    prompt: 'Which planet is known as the Red Planet?',
    choices: ['Venus', 'Mars', 'Jupiter', 'Mercury'],
    answer: 'B',
  },
  {
    category: 'Geography',
    prompt: 'What is the capital city of Japan?',
    choices: ['Seoul', 'Beijing', 'Tokyo', 'Bangkok'],
    answer: 'C',
  },
  {
    category: 'Nature',
    prompt: 'How many legs does a spider have?',
    choices: ['Six', 'Eight', 'Ten', 'Twelve'],
    answer: 'B',
  },
  {
    category: 'Technology',
    prompt: 'What does CPU stand for?',
    choices: [
      'Central Processing Unit',
      'Computer Power Utility',
      'Core Program Upload',
      'Central Program User',
    ],
    answer: 'A',
  },
  {
    category: 'Literature',
    prompt: 'Who wrote "The Hobbit"?',
    choices: ['C. S. Lewis', 'J. K. Rowling', 'George Orwell', 'J. R. R. Tolkien'],
    answer: 'D',
  },
];

function getDurationSetting(value, fallback) {
  const duration = Number(value);
  return Number.isFinite(duration) && duration >= 1 ? duration : fallback;
}

const timeLimitSeconds = getDurationSetting(process.env.TRIVIA_TIME_LIMIT_SECONDS, 15);
const gameDurationSeconds = getDurationSetting(process.env.TRIVIA_GAME_DURATION_SECONDS, 120);

function normalizeAnswer(answer) {
  return answer.trim().toUpperCase();
}

function isValidAnswer(answer) {
  return /^[A-D]$/.test(answer);
}

function getPerformanceMessage(score, total) {
  if (total === 0) return 'No questions were answered this round.';
  const percentage = (score / total) * 100;
  if (percentage === 100) return 'Perfect round. You know your stuff!';
  if (percentage >= 60) return 'Nice work. You have a strong trivia streak.';
  if (percentage > 0) return 'Good effort. There is always another round.';
  return 'A clean slate. Ready for a rematch?';
}

function getScore(results) {
  return results.reduce((total, result) => total + (result.correct ? 1 : 0), 0);
}

async function askWithTimeout(rl, prompt, timeoutMs, readAnswer) {
  if (!stdout.isTTY) {
    stdout.write(prompt);
    return readAnswer(timeoutMs);
  }

  const controller = new AbortController();
  const startedAt = Date.now();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  rl.setPrompt(prompt);
  const answerPromise = rl.question('', { signal: controller.signal });
  rl.prompt(true);
  const countdown = setInterval(() => {
    const secondsLeft = Math.max(0, Math.ceil((timeoutMs - (Date.now() - startedAt)) / 1000));
    const promptLabel = prompt.replace(/\s+\(\d+s\): $/, '');
    rl.setPrompt(`${promptLabel} (${secondsLeft}s): `);
    rl.prompt(true);
  }, 1000);

  try {
    return await answerPromise;
  } catch (error) {
    if (error.name === 'AbortError') return null;
    if (rl.closed) return undefined;
    throw error;
  } finally {
    clearTimeout(timer);
    clearInterval(countdown);
  }
}

function createAnswerReader(rl) {
  const answers = [];
  const waiters = [];
  let closed = false;

  rl.on('line', (answer) => {
    const waiter = waiters.shift();
    if (waiter) {
      clearTimeout(waiter.timer);
      waiter.resolve(answer);
    } else {
      answers.push(answer);
    }
  });

  rl.on('close', () => {
    closed = true;
    while (waiters.length > 0) {
      const waiter = waiters.shift();
      clearTimeout(waiter.timer);
      waiter.resolve(undefined);
    }
  });

  return (timeoutMs) => new Promise((resolve) => {
    if (answers.length > 0) {
      resolve(answers.shift());
      return;
    }
    if (closed) {
      resolve(undefined);
      return;
    }

    const waiter = {
      resolve,
      timer: setTimeout(() => {
        const index = waiters.indexOf(waiter);
        if (index !== -1) waiters.splice(index, 1);
        resolve(null);
      }, timeoutMs),
    };
    waiters.push(waiter);
  });
}

async function presentQuestion(rl, question, index, gameDeadline, readAnswer) {
  const questionDeadline = Math.min(
    Date.now() + timeLimitSeconds * 1000,
    gameDeadline,
  );

  console.log(`Question ${index + 1}/${questions.length}  ·  ${question.category}`);
  console.log(question.prompt);
  question.choices.forEach((choice, choiceIndex) => {
    console.log(`  ${String.fromCharCode(65 + choiceIndex)}. ${choice}`);
  });

  let answer = null;
  while (Date.now() < questionDeadline) {
    const remainingMs = questionDeadline - Date.now();
    answer = await askWithTimeout(
      rl,
      `Your answer (${Math.ceil(remainingMs / 1000)}s): `,
      remainingMs,
      readAnswer,
    );

    if (answer === undefined || answer === null) break;
    answer = normalizeAnswer(answer);
    if (Date.now() >= questionDeadline) {
      answer = null;
      break;
    }
    if (isValidAnswer(answer)) break;
    console.log('Enter A, B, C, or D to lock in an answer.');
  }

  if (answer === undefined) return null;

  const correct = answer !== null && isValidAnswer(answer) && answer === question.answer;
  if (correct) {
    console.log('Correct!\n');
  } else if (answer === null) {
    const message = Date.now() >= gameDeadline ? 'Game time is up.' : 'Time is up.';
    console.log(`${message} The answer was ${question.answer}.\n`);
  } else {
    console.log(`Not quite. The answer was ${question.answer}.\n`);
  }

  return {
    question: question.prompt,
    category: question.category,
    answer,
    correct,
    timedOut: answer === null,
  };
}

async function startGame() {
  const rl = readline.createInterface({ input: stdin, output: stdout });
  const readAnswer = stdout.isTTY ? null : createAnswerReader(rl);
  const results = [];
  const gameDeadline = Date.now() + gameDurationSeconds * 1000;

  console.log('\nTRIVIA NIGHT');
  console.log(`${questions.length} questions  |  ${gameDurationSeconds} seconds total`);
  console.log(`Each answer has a ${timeLimitSeconds}-second limit, capped by the game timer.`);
  console.log('Answer with A, B, C, or D.\n');

  try {
    for (let index = 0; index < questions.length && Date.now() < gameDeadline; index += 1) {
      const result = await presentQuestion(rl, questions[index], index, gameDeadline, readAnswer);
      if (result === null) {
        console.log('\nInput closed. Ending the quiz.\n');
        break;
      }
      results.push(result);
      if (Date.now() >= gameDeadline) break;
    }

    const score = getScore(results);
    console.log(`Final score: ${score}/${results.length} answered (${questions.length} questions available)`);
    console.log(getPerformanceMessage(score, results.length));
    if (results.length > 0) {
      console.log('\nRound results:');
      results.forEach((result, index) => {
        const status = result.correct ? 'Correct' : result.timedOut ? 'Timed out' : 'Incorrect';
        console.log(`${index + 1}. ${result.category}: ${status}`);
      });
    }
  } finally {
    rl.close();
  }
}

if (require.main === module) {
  startGame().catch((error) => {
    console.error(`Unable to run the quiz: ${error.message}`);
    process.exitCode = 1;
  });
}

module.exports = {
  getDurationSetting,
  getPerformanceMessage,
  getScore,
  isValidAnswer,
  normalizeAnswer,
};