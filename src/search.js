const { connect } = require('puppeteer-real-browser');
const readline = require('readline');
const ansiEscapes = require('ansi-escapes');
const chalk = require('chalk');

async function searchForAnime(query) {
  let browser;
  try {
    console.log(chalk.cyan(`\n[SEARCH] Query: ${chalk.magenta.bold(`"${query}"`)}`));
    const { page, browser: connectedBrowser } = await connect({
      headless: false,
      args: ['--no-sandbox', '--disable-web-security', '--disable-blink-features=AutomationControlled'],
    });
    browser = connectedBrowser;
    
    // Search
    const searchUrl = `https://animekai.to/browser?keyword=${encodeURIComponent(query)}`;
    await page.goto(searchUrl, { waitUntil: 'domcontentloaded' });
    console.log(chalk.yellow('[WAIT] Fetching results...'));
    await new Promise(r => setTimeout(r, 3000));
    
    const results = await page.evaluate(() => {
      return Array.from(document.querySelectorAll('div.aitem')).map(item => {
        const posterLink = item.querySelector('a.poster');
        const titleLink = item.querySelector('a.title');
        if (!posterLink || !titleLink) return null;
        return {
          title: titleLink.textContent?.trim() || 'Unknown Title',
          url: posterLink.href || '',
          sub: item.querySelector('span.sub')?.textContent.trim() || null,
          dub: item.querySelector('span.dub')?.textContent.trim() || null,
        };
      }).filter(Boolean);
    });

    if (results.length === 0) {
      console.log(chalk.red('[WARN] No results found.'));
      return null;
    }
    return await runInteractiveMenu(results);
  } catch (error) {
    console.error(chalk.red('[ERROR] Search failed:'), error.message);
    return null;
  } finally {
    if (browser) await browser.close();
  }
}

function runInteractiveMenu(results) {
  return new Promise(resolve => {
    let currentIndex = 0;
    const clearScreen = () => { process.stdout.write(ansiEscapes.clearScreen + ansiEscapes.cursorTo(0, 0)); };

    // Selection
    const renderMenu = () => {
      clearScreen();
      console.log(chalk.bold.cyan('[?] Please select an anime') + chalk.gray(' (Use Arrows, Enter, Ctrl+C to cancel)'));
      console.log('');

      results.forEach((result, index) => {
        const maxTitleWidth = 80;
        let displayTitle = result.title;
        if (displayTitle.length > maxTitleWidth) {
          displayTitle = displayTitle.substring(0, maxTitleWidth - 3) + '...';
        }

        const infoParts = [];
        if (result.sub) infoParts.push(chalk.bgHex('#D9531E').black(` CC ${result.sub} `));
        if (result.dub) infoParts.push(chalk.bgGreen.black(` DUB ${result.dub} `));
        
        const paddedTitle = displayTitle.padEnd(maxTitleWidth, ' ');
        const lineContent = `${paddedTitle}  ${infoParts.join(' ')}`;
        const selector = (index === currentIndex) ? '>' : ' ';

        if (index === currentIndex) {
          console.log(chalk.cyan(selector) + chalk.cyan.bold(` ${lineContent}`));
        } else {
          console.log(chalk.dim(`  ${lineContent}`));
        }
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
      else if (key.name === 'return' || key.name === 'enter') { cleanup(); resolve(results[currentIndex].url); }
      else if (key.name === 'up' && currentIndex > 0) { currentIndex--; renderMenu(); }
      else if (key.name === 'down' && currentIndex < results.length - 1) { currentIndex++; renderMenu(); }
    });
    
    renderMenu();
  });
}

module.exports = { searchForAnime };
