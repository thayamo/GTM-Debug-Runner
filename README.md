# GTM Debug Runner

![Version](https://img.shields.io/badge/version-1.0.1-4285F4?style=flat-square) ![Manifest](https://img.shields.io/badge/manifest-v3-34A853?style=flat-square)

Chrome extension for the sequential processing of untagged URLs from Google Tag Coverage CSV exports. The extension automatically loads each page with an appended `gtm_debug` parameter, visualizes progress and ETA, and provides full run control (start, pause, resume, abort).

## Installation (Developer Mode)
1. Open Chrome → `chrome://extensions/`
2. Enable **Developer mode** → click **Load unpacked**
3. Select the `GTM_Debug_Runner` folder (must contain `manifest.json`)

## Usage
- **Toolbar icon**: The toggle enables or disables the Debug Runner (state is persisted).
- **Overlay**: Appears only when the toggle is active **and** the current URL contains the `gtm_debug` parameter.
- **CSV upload**: Only `.csv` files are accepted. From the Tag Coverage export, only rows with status *“Not tagged”* are automatically imported.
- **Run control**:
  - *Start* loads the URLs sequentially with a configurable delay
  - *Pause / Resume* suspends or continues the run
  - *Abort* stops the current run
- **Progress**: Displays current index, countdown, ETA, and an animated progress bar.  
  After completion: 100% state with options *Finish* (clear state) or *Restart* (run again from index 0).
- **Overlay position**: Draggable; position is persisted.
- **Persistence**: Run state (URL list, current index, state, debug value, filename, overlay position) is stored in `chrome.storage.local`, allowing the run to continue across page or domain changes.
- **Upload feedback**:
  - Green: valid CSV with number of detected URLs
  - Red: invalid CSV or no usable *Not tagged* entries
  - *Start* remains disabled until a valid URL list is available

## Permissions
- `storage` – stores settings and run state
- `tabs` – reloads the active tab when enabling/disabling via the popup

## Notes
- The overlay is shown only if the `gtm_debug` parameter is present in the page URL.
- CSV files without valid URLs or without *Not tagged* entries will block the start.
- While a run is active (`running`), the toggle in the popup is disabled.
