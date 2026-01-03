# Anime Search & Batch Downloader CLI

A robust, command-line tool designed to search for, extract, and batch download anime episodes. This project utilizes browser automation to bypass standard protection layers, extracts M3U8 playlists, and leverages high-performance tools to download video streams and subtitles.

## Features

- **Interactive CLI:** User-friendly prompts for searching, selection, and configuration.
- **Search & Discovery:** Search for anime directly from the terminal or provide a direct URL.
- **Batch Downloading:** Download single episodes or entire ranges (e.g., `1-12`).
- **Quality Control:** Auto-detects available resolutions. Select your preferred quality once, and the script applies it to the entire batch.
- **Sub/Dub Support:** Choose between Subbed or Dubbed versions.
- **Subtitle Extraction:** Automatically extracts and downloads `.vtt` subtitle files if available.
- **File Management:** Automatically organizes downloads into named folders in your home directory.

Before you begin, ensure your system has the following installed:

1.  **Node.js**: Version 16 or higher. [Download here](https://nodejs.org/).
2.  **FFmpeg**: Required for merging video and audio streams. [Download here](https://ffmpeg.org/download.html).
3.  **Git**: To clone the repository.

## Installation & Setup

Follow these line-by-line instructions to set up the project on your machine.

### 1. Clone the repository
```
git clone https://github.com/cluelessbaj/ani_scraper
```

### 2. Navigate into the project folder
```
cd ani_scraper
```

### 3. Install project dependencies
```
npm install
```

### 4. Install the required downloader tool globally
```
npm install -g n-m3u8dl-re
```

##$ 5. Run the application
```
node index.js
```


