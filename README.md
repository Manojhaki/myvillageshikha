# My Village Shikha

An illustrated website for **My Village Shikha**, an animated series in development. Explore the village, meet Maya, Mukunda, Pintu, Aama and Bhumi, and draw the spiral that connects the children to the forest.

The complete website lives in `docs/`. It includes the cardboard artwork, responsive layouts, story dialogs, decorative owl and fox overlays, scroll parallax, a side-view waterfall with moving foam, the Nepal map with Shikha marked, and the interactive spiral drawing activity. The About page is in `docs/work-with-us/`.

## Preview locally

Install [Node.js](https://nodejs.org/) and run these commands from this repository:

```sh
npm run dev
```

Open <http://127.0.0.1:4174/>. To preview the same path used by the repository's GitHub Pages site, open <http://127.0.0.1:4174/myvillageshikha/>. Stop the server with `Ctrl+C`.

No dependencies or build step are required. To use a different port in PowerShell:

```powershell
$env:PORT = '4175'
npm run dev
```

## Host on GitHub Pages

1. Open this repository on GitHub and choose **Settings → Pages**.
2. Under **Build and deployment**, set **Source** to **Deploy from a branch**.
3. Select the **master** branch and the **/docs** folder, then choose **Save**.
4. Wait for GitHub's deployment to finish. The website will be available at <https://manojhaki.github.io/myvillageshikha/>.

These steps follow [GitHub's publishing source instructions](https://docs.github.com/en/pages/getting-started-with-github-pages/configuring-a-publishing-source-for-your-github-pages-site). The `docs/.nojekyll` file lets GitHub publish these static files directly. Future changes pushed to `master` in `docs/` are published automatically after Pages is enabled.

## Edit and validate

- Edit `docs/index.html` for the main page and `docs/work-with-us/index.html` for About.
- Styles are in `docs/*.css`; artwork and fonts are in `docs/assets/`.
- `docs/app.js` handles the site interface; `docs/scenery-scroll.js` handles scroll scenery.
- `docs/spiral-drawing.js` and `docs/spiral-recognition.js` implement the drawing activity.

Run the link and JavaScript checks before pushing changes:

```sh
npm run check
```

The checker follows the main and About pages, their stylesheets, images and module imports. It verifies local links and anchors at both `/` and `/myvillageshikha/`, then checks the syntax of the active JavaScript files. Preview the result on desktop and mobile when changing layouts or interactions.

## Export notes

This copy contains the full published website and all 72 original asset files. Local HTML and CSS links use relative paths so the site works both at a domain root and under the GitHub repository path. Character artwork and active JavaScript were preserved during export.
