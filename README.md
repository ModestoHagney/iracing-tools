# iRacing tools

A web page for editing iRacing track camera sets (`Documents\iRacing\cameras\tracks\...\track.cam`) in Chrome or Edge. The page opens your iRacing folder directly; your files never leave your PC.

- `index.html`: the page
- `cam.js`: reads and writes track.cam (format notes at the top)
- `test/`: `npm test`, or `TRACK_CAM=path/to/track.cam npm test` to check a real file round-trips byte for byte

Every save backs up the old file to `cameras\_backup_web\<time>\` first. Close iRacing before saving.

Deploys like Overspray: push to main updates tools.niftyfi.sh/_lab/iracing; Run workflow (Actions > Deploy) updates the live copy.
