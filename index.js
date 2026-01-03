
const VideoExtractorDownloader = require('./src/extractor');
const { searchForAnime } = require('./src/search');
const { askQuestion, extractAnimeName, parseEpisodeRange, extractBaseUrl, askQuality, askToggle } = require('./src/utils');
const chalk = require('chalk');

// Error handler
process.on('uncaughtException', (error) => {
  if (error.code === 'ECONNRESET') {
    console.log(chalk.yellow('\n[WARN] Network connection reset - continuing...'));
    return;
  }
  console.error(chalk.red('[ERROR] Uncaught Exception:'), error);
  process.exit(1);
});
process.on('unhandledRejection', (reason) => {
  if (reason && reason.code === 'ECONNRESET') {
    console.log(chalk.yellow('\n[WARN] Promise rejected due to connection reset - continuing...'));
    return;
  }
  console.error(chalk.red('[ERROR] Unhandled Rejection:'), reason);
});

async function main() {
  console.log(chalk.bold.cyan('Anime Search & Downloader'));
  console.log(chalk.gray('========================================='));

  // Initial user input: Search or direct link
  let inputUrl;
  const choice = await askToggle('How do you want to find an anime?', ['Search', 'Link']);

  if (choice === 'Search') {
    const searchQuery = await askQuestion('Enter anime name to search: ');
    if (!searchQuery.trim()) {
        console.log(chalk.red('[ERROR] Search query cannot be empty.'));
        return;
    }
    inputUrl = await searchForAnime(searchQuery);
    if (!inputUrl) {
      console.log(chalk.yellow('\n[WARN] No anime selected. Exiting.'));
      return;
    }
    console.log(chalk.green(`\n[OK] URL selected: ${chalk.white.bold(inputUrl)}`));
  } else {
    inputUrl = await askQuestion('Enter the full URL: ');
    if (!inputUrl) {
      console.log(chalk.red('[ERROR] URL cannot be empty.'));
      return;
    }
  }

  // Extract metadata and configure download options
  const animeName = extractAnimeName(inputUrl);
  const baseUrl = extractBaseUrl(inputUrl);
  console.log(chalk.cyan(`\n[INFO] Detected anime: ${chalk.magenta.bold(animeName.replace(/_/g, ' '))}`));

  const videoType = await askToggle('Choose video type:', ['sub', 'dub']);
  let downloadSubtitles = false;
  if (videoType === 'dub') {
    const subtitleChoice = await askToggle('Download separate subtitles?', ['no', 'yes']);
    downloadSubtitles = (subtitleChoice === 'yes');
  }

  const episodeRange = await askQuestion('Enter episode(s) to download (e.g., 5 or 1-5): ');
  const episodes = parseEpisodeRange(episodeRange);

  if (episodes.length === 0) {
    console.log(chalk.red('[ERROR] Invalid episode range.'));
    return;
  }

  // Pre-check first episode to set preferred quality for the batch
  let preferredQuality = null;

  if (episodes.length > 0) {
    const firstEpisode = episodes[0];
    const progress = chalk.gray(`(1/${episodes.length})`);
    console.log(chalk.cyan(`\n[INFO] Checking qualities for Episode ${chalk.magenta.bold(firstEpisode)} ${progress}`));
    console.log(chalk.gray('-'.repeat(50)));
    
    const firstExtractor = new VideoExtractorDownloader(firstEpisode, videoType, animeName, downloadSubtitles);
    const streamChoices = await firstExtractor.runExtraction(`${baseUrl}${firstEpisode}`);

    if (!streamChoices || streamChoices.length === 0) {
        console.log(chalk.red('[ERROR] No streams found for first episode. Aborting.'));
        return;
    }

    const selectedStream = await askQuality(streamChoices);
    if (!selectedStream) {
        console.log(chalk.yellow('[WARN] No quality selected. Exiting.'));
        return;
    }
    
    preferredQuality = selectedStream.quality;
    console.log(chalk.green(`[OK] Preferred quality set to: ${chalk.white.bold(preferredQuality)}`));

    await firstExtractor.startDownload(selectedStream.url);

    if (episodes.length > 1) {
        console.log(chalk.yellow('\n[WAIT] Waiting 5 seconds...'));
        await new Promise(resolve => setTimeout(resolve, 5000));
    }
  }

  // Process remaining episodes using the preferred quality
  for (let i = 1; i < episodes.length; i++) {
    const episode = episodes[i];
    const progress = chalk.gray(`(${i + 1}/${episodes.length})`);
    console.log(chalk.cyan(`\n[INFO] Processing ${chalk.magenta.bold(videoType.toUpperCase())} Episode ${chalk.magenta.bold(episode)} ${progress}`));
    console.log(chalk.gray('-'.repeat(50)));

    const episodeUrl = `${baseUrl}${episode}`;
    const extractor = new VideoExtractorDownloader(episode, videoType, animeName, downloadSubtitles);

    try {
      const streamChoices = await extractor.runExtraction(episodeUrl);

      if (!streamChoices || streamChoices.length === 0) {
        console.log(chalk.red('[ERROR] No streams found. Skipping.'));
        continue;
      }

      let streamToDownload = streamChoices.find(c => c.quality === preferredQuality);

      if (streamToDownload) {
        console.log(chalk.green(`[OK] Selected preferred quality: ${chalk.white.bold(streamToDownload.quality)}`));
      } else {
        streamToDownload = streamChoices.find(c => c.quality.includes('Auto')) || streamChoices[0];
        console.log(chalk.yellow(`[WARN] ${preferredQuality} unavailable. Fallback: ${chalk.white.bold(streamToDownload.quality)}`));
      }
      
      await extractor.startDownload(streamToDownload.url);

    } catch (error) {
      console.error(chalk.red(`[ERROR] Failed Episode ${episode}: ${error.message}`));
    }

    if (i < episodes.length - 1) {
      console.log(chalk.yellow('\n[WAIT] Waiting 5 seconds...'));
      await new Promise(resolve => setTimeout(resolve, 5000));
    }
  }
}

main().catch(err => console.error(chalk.red('[FATAL] Error in main:'), err));
