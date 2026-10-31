ChainSight — GitHub Recovery Bundle
This bundle gathers the ChainSight files that were available in the saved backups. It preserves the original ZIP archives and unpacks each archive into a separate folder so different stages do not overwrite one another.
Contents
- core_files/ — convenience copies of the Stage 8D main.py, app.js, and index.html.
- archives_original/ — original saved ZIP backups, unchanged.
- recovered_versions/ — each ZIP unpacked in its own folder, plus standalone HTML snapshots.
- reference_material/ — the saved Sample BE Project PPT.pptx template. This is a reference template, not a confirmed ChainSight presentation.
Important notes
- This is a source-file recovery bundle, not a recovery of the old GitHub repository's commit history, branches, issues, secrets, or settings. Those require GitHub account/repository recovery or a local .git copy.
- Some backups contain older versions of files with the same names. Compare versions before deciding which one to deploy. Do not blindly combine all versions into one application.
- The Stage 8E snapshots are preserved separately; they may expect the configured API endpoint to be available.
- Never commit API keys, passwords, private keys, .env files, or real user data.
Create a new GitHub repository (Windows PowerShell)
1. Extract this ZIP to a working folder.
2. Create an empty repository in the new GitHub account. Do not initialize it with a README if you plan to push this folder as-is.
3. Open PowerShell in the extracted ChainSight-GitHub-Recovery folder.
4. Run:
git init
git add .
git commit -m "Restore ChainSight project files"
git branch -M main
git remote add origin https://github.com/YOUR-NEW-USERNAME/YOUR-NEW-REPO.git
git push -u origin main
Replace YOUR-NEW-USERNAME and YOUR-NEW-REPO with the new account and repository names. GitHub may ask you to authenticate in a browser.
Run the backend version
Inspect recovered_versions/ChainSight-Backend-Stage2/README.md and its requirements.txt first. That version includes Docker files and app/main.py. The Stage 8D chainsight/main.py is a different saved version; check its imports and requirements before running.
File inventory
The original archives are retained in archives_original/; their contents are extracted into matching folders under recovered_versions/.
