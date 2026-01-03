
const { connect } = require('puppeteer-real-browser');
const fs = require('fs');
const path = require('path');
const { exec, spawn } = require('child_process');
const os = require('os');
const chalk = require('chalk');
const axios = require('axios');
const cliProgress = require('cli-progress');

class VideoExtractorDownloader {
  constructor(episodeNumber = '', videoType = 'sub', animeName = 'anime', shouldDownloadSubtitles = false) {
    this.episodeNumber = episodeNumber;
    this.videoType = videoType;
    this.animeName = animeName;
    this.shouldDownloadSubtitles = shouldDownloadSubtitles;
    
    // Configure download directories
    const downloadsBaseDir = path.join(os.homedir(), 'anime-downloads');
    this.animeDir = path.join(downloadsBaseDir, this.animeName);
    this.downloadsDir = path.join(this.animeDir, 'downloads');
    this.subsDir = path.join(this.animeDir, 'downloads', 'subs');
    this.videoStreams = new Set();
    this.subtitles = new Set();
    
    [this.animeDir, this.downloadsDir, this.subsDir].forEach(dir => {
      if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
    });
  }

  _getCleanFilenameBase() {
    const safeAnimeName = this.animeName.replace(/\s+/g, '_').toLowerCase();
    return `${safeAnimeName}_ep${this.episodeNumber}_${this.videoType}`;
  }

  async runExtraction(url) {
    console.log(chalk.cyan('[START] Extracting video streams...'));
    let browser;
    try {
      console.log(chalk.cyan('[DEBUG] Launching browser...'));
      const { page, browser: connectedBrowser } = await connect({
        headless: false,
        args: ['--no-sandbox', '--disable-web-security', '--disable-blink-features=AutomationControlled', '--disable-images'],
        turnstile: true,
      });
      browser = connectedBrowser;

      // catpture vtt and m3u8
      await page.setRequestInterception(true);
      page.on('request', (req) => {
        const url = req.url();
        if (url.includes('.m3u8')) this.videoStreams.add(url);
        if (url.includes('/subs/') && url.endsWith('.vtt')) this.subtitles.add(url);
        req.continue();
      });

      console.log(chalk.cyan(`[DEBUG] Navigating to: ${url}`));
      await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 25000 });

      // Attempt to click the correct sub/dub tab
      const tabSelector = `span.tab[data-id="${this.videoType}"]`;
      try {
        console.log(chalk.cyan(`[DEBUG] Selecting '${this.videoType}' tab...`));
        await page.waitForSelector(tabSelector, { timeout: 15000 });
        await page.click(tabSelector);
        console.log(chalk.green(`[DEBUG] Clicked '${this.videoType}' tab.`));
      } catch (e) {
        console.log(chalk.yellow(`[WARN] '${this.videoType}' tab not found or clickable.`));
      }

      console.log(chalk.cyan('[DEBUG] Waiting for stream detection...'));
      await new Promise(r => setTimeout(r, 8000));

      const streams = Array.from(this.videoStreams);
      const masterUrl = streams.find(s => s.includes('/list,') || s.includes('master.m3u8'));

      if (!masterUrl) {
        console.log(chalk.red('[ERROR] Master playlist not found.'));
        return [];
      }

      // Resolution parser
      console.log(chalk.cyan(`[DEBUG] Parsing master playlist...`));
      const { data: playlistContent } = await axios.get(masterUrl);
      const lines = playlistContent.split('\n');
      const qualityChoices = [{ url: masterUrl, quality: 'Auto (Master)' }];

      for (let i = 0; i < lines.length; i++) {
        if (lines[i].startsWith('#EXT-X-STREAM-INF')) {
          const resolutionMatch = lines[i].match(/RESOLUTION=\d+x(\d+)/);
          const quality = resolutionMatch ? `${resolutionMatch[1]}p` : 'Unknown';
          const streamUrl = new URL(lines[i + 1], masterUrl).href;
          qualityChoices.push({ url: streamUrl, quality });
        }
      }
      
      console.log(chalk.green(`[SUCCESS] Found ${qualityChoices.length} qualities.`));
      return qualityChoices;

    } catch (err) {
      console.error(chalk.red('[ERROR] Extraction failed:'), err.message);
      throw err;
    } finally {
      if (browser) await browser.close();
    }
  }
  
  async startDownload(streamUrl) {
    const tool = await this.checkTools();
    if (!tool) return { success: false, reason: 'Tool missing' };
    await this.downloadSubtitles();
    const result = await this.downloadStream(streamUrl);
    if (result.success) {
      console.log(chalk.green(`\n[DONE] Download complete!`));
      console.log(chalk.green(`[INFO] Files located in: '${this.downloadsDir}'`));
    }
    return result;
  }

  downloadStream(streamUrl) {
    const cleanFilenameBase = this._getCleanFilenameBase();
    const headerArgs = `-H "Referer: https://animekai.bz/" -H "User-Agent: Mozilla/5.0"`;
    const command = `n-m3u8dl-re "${streamUrl}" ${headerArgs} --save-name "${cleanFilenameBase}" --save-dir "${this.downloadsDir}" --auto-select --no-log`;
    
    return new Promise((resolve, reject) => {
      console.log(`\n[DOWNLOAD] Downloading: ${chalk.cyan(cleanFilenameBase + '.mp4')}`);
      const progressBar = new cliProgress.SingleBar({
          format: `Progress |${chalk.cyan('{bar}')}| {percentage}%`,
          barCompleteChar: '#',
          barIncompleteChar: '-',
          hideCursor: true,
          clearOnComplete: false,
      });
      const child = spawn('sh', ['-c', command], { stdio: ['ignore', 'pipe', 'pipe'] });
      let progressStarted = false;
      
      const streamHandler = (data) => {
        const m = data.toString().match(/(\d+(?:\.\d+)?)%/);
        if (m) {
          if (!progressStarted) {
            progressBar.start(100, 0);
            progressStarted = true;
          }
          progressBar.update(Math.floor(parseFloat(m[1])));
        }
      };
      
      child.stdout.on('data', streamHandler);
      child.stderr.on('data', streamHandler);
      child.on('close', code => {
        if (progressStarted) {
          if (code === 0) progressBar.update(100);
          progressBar.stop();
        }
        if (code === 0) {
          console.log(`[DONE] Finished: ${chalk.green(cleanFilenameBase + '.mp4')}`);
          resolve({ success: true });
        } else {
          if (progressStarted) process.stdout.write('\n');
          reject(new Error(`Download failed: ${cleanFilenameBase}.mp4`));
        }
      });
    });
  }

  async downloadSubtitles() {
    if (!this.shouldDownloadSubtitles || this.subtitles.size === 0) return;
    console.log(chalk.cyan('[SUBS] Downloading subtitles...'));
    const promises = [...this.subtitles].map(async (url, index) => {
      const filename = `${this._getCleanFilenameBase()}_sub${index + 1}.vtt`;
      const filepath = path.join(this.subsDir, filename);
      return new Promise((resolve) => {
        exec(`curl -L "${url}" -o "${filepath}" --silent`, (error) => {
          if (error) console.error(chalk.red(`[ERROR] Failed subtitle: ${filename}`));
          else console.log(chalk.green(`[OK] Downloaded subtitle: ${filename}`));
          resolve();
        });
      });
    });
    await Promise.all(promises);
  }

  async checkTools() {
    return new Promise((resolve) => {
      exec('n-m3u8dl-re --version', (error) => {
        if (error) {
            console.log(chalk.red('[ERROR] n-m3u8dl-re not found.'));
            console.log(chalk.yellow('[TIP] Install with: npm install -g n-m3u8dl-re'));
            resolve(null);
        } else {
            resolve('n-m3u8dl-re');
        }
      });
    });
  }
}

module.exports = VideoExtractorDownloader;
