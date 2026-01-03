const readline = require('readline');
const { URL } = require('url');
const ansiEscapes = require('ansi-escapes');
const chalk = require('chalk');

function extractAnimeName(url) {
  try {
    const urlObject = new URL(url);
    const pathSegments = urlObject.pathname.split('/').filter(segment =>
      segment && !['watch', 'anime', 'video'].includes(segment)
    );
    if (pathSegments.length > 0) return pathSegments[pathSegments.length - 1].replace(/-/g, '_');
  } catch (error) { console.log(chalk.red('[ERROR] URL parse failed.')); }
  return 'anime';
}

function askQuestion(query) {
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
  const coloredQuery = chalk.cyan.bold('[?] ') + chalk.white(query);
  return new Promise(resolve => rl.question(coloredQuery, ans => { rl.close(); resolve(ans); }));
}

function parseEpisodeRange(rangeStr) {
  if (!rangeStr.includes('-')) {
    const episode = Number(rangeStr);
    return isNaN(episode) ? [] : [episode];
  }
  const [start, end] = rangeStr.split('-').map(Number);
  if (isNaN(start) || isNaN(end) || start > end) return [];
  const episodes = [];
  for (let i = start; i <= end; i++) { episodes.push(i); }
  return episodes;
}

function extractBaseUrl(url) {
  const baseUrl = url.replace(/(#ep=.*|#ep.*)$/, '');
  return baseUrl + (baseUrl.includes('#') ? '' : '#') + 'ep=';
}

function askQuality(choices) {
  // quality sorting
  choices.sort((a, b) => {
    if (a.quality.includes('Auto')) return -1;
    if (b.quality.includes('Auto')) return 1;
    return parseInt(b.quality) - parseInt(a.quality);
  });

  return new Promise(resolve => {
    let currentIndex = 0;
    const clearScreen = () => { process.stdout.write(ansiEscapes.clearScreen + ansiEscapes.cursorTo(0, 0)); };
    const renderMenu = () => {
      clearScreen();
      console.log(chalk.bold.cyan('[?] Select video quality') + chalk.gray(' (Use Arrows, Enter)'));
      console.log('');
      choices.forEach((choice, index) => {
        const label = ` ${choice.quality} `;
        if (index === currentIndex) console.log(chalk.bgCyan.black.bold(` >${label}`));
        else console.log(chalk.dim(`  ${label}`));
      });
    };
    const cleanup = () => {
      process.stdin.removeAllListeners('keypress');
      if (process.stdin.isTTY) process.stdin.setRawMode(false);
      process.stdin.pause();
      clearScreen();
    };
    readline.emitKeypressEvents(process.stdin);
    if (process.stdin.isTTY) process.stdin.setRawMode(true);
    process.stdin.resume();
    process.stdin.on('keypress', (str, key) => {
      if (key.ctrl && key.name === 'c') { cleanup(); resolve(null); }
      else if (key.name === 'return' || key.name === 'enter') { cleanup(); resolve(choices[currentIndex]); }
      else if (key.name === 'up' && currentIndex > 0) { currentIndex--; renderMenu(); }
      else if (key.name === 'down' && currentIndex < choices.length - 1) { currentIndex++; renderMenu(); }
    });
    renderMenu();
  });
}

function askToggle(query, options) {
  return new Promise(resolve => {
    let currentIndex = 0;
    const clearLine = () => { process.stdout.write(ansiEscapes.eraseLine + ansiEscapes.cursorTo(0)); };
    const renderToggle = () => {
      clearLine();
      const prompt = chalk.cyan.bold('[?] ') + chalk.white(query) + ' ';
      const optionsDisplay = options.map((option, index) => {
        const formattedOption = ` ${option.charAt(0).toUpperCase() + option.slice(1)} `;
        if (index === currentIndex) return chalk.bgCyan.black.bold(formattedOption);
        return chalk.dim.bgGray(formattedOption);
      }).join(' ');
      process.stdout.write(prompt + optionsDisplay);
    };
    const cleanup = () => {
      clearLine();
      process.stdin.removeAllListeners('keypress');
      if (process.stdin.isTTY) process.stdin.setRawMode(false);
      process.stdin.pause();
    };
    readline.emitKeypressEvents(process.stdin);
    if (process.stdin.isTTY) process.stdin.setRawMode(true);
    process.stdin.resume();
    process.stdin.on('keypress', (str, key) => {
      if (key.ctrl && key.name === 'c') { cleanup(); process.exit(); }
      else if (key.name === 'return' || key.name === 'enter') {
        cleanup();
        const finalPrompt = chalk.green('[SELECTED] ') + chalk.white(query) + ' ';
        const finalAnswer = chalk.cyan.bold(options[currentIndex].charAt(0).toUpperCase() + options[currentIndex].slice(1));
        process.stdout.write(finalPrompt + finalAnswer + '\n');
        resolve(options[currentIndex]);
      } else if (key.name === 'left' || key.name === 'up') { if (currentIndex > 0) currentIndex--; renderToggle(); }
      else if (key.name === 'right' || key.name === 'down') { if (currentIndex < options.length - 1) currentIndex++; renderToggle(); }
    });
    renderToggle();
  });
}

module.exports = { extractAnimeName, askQuestion, parseEpisodeRange, extractBaseUrl, askQuality, askToggle };
