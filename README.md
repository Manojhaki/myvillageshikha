# My Village Shikha

An illustrated website for **My Village Shikha**, an animated series in development. Explore the village, meet Maya, Mukunda, Pintu, Aama and Bhumi, and draw the spiral that connects the children to the forest.

The complete website lives in `docs/`. It includes the cardboard artwork, responsive layouts, story dialogs, decorative owl and fox overlays, scroll parallax, a side-view waterfall with moving foam, the Nepal map with Shikha marked, and the interactive spiral drawing activity. The About page is in `docs/about/`.

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

## Host on AWS Amplify

The root `amplify.yml` runs `npm run check` and publishes `docs/` as the website root. The connected `master` branch deploys automatically when changes are pushed.

The publish directory is `docs`, which contains `index.html`, the About page, styles, scripts and artwork. The Node preview server is only needed for local development.

See [AWS Amplify's build specification reference](https://docs.aws.amazon.com/amplify/latest/userguide/yml-specification-syntax.html) for the `artifacts.baseDirectory` setting.

## Host on GitHub Pages

1. Open this repository on GitHub and choose **Settings → Pages**.
2. Under **Build and deployment**, set **Source** to **Deploy from a branch**.
3. Select the **master** branch and the **/docs** folder, then choose **Save**.
4. Wait for GitHub's deployment to finish. The website will be available at <https://manojhaki.github.io/myvillageshikha/>.

These steps follow [GitHub's publishing source instructions](https://docs.github.com/en/pages/getting-started-with-github-pages/configuring-a-publishing-source-for-your-github-pages-site). The `docs/.nojekyll` file lets GitHub publish these static files directly. Future changes pushed to `master` in `docs/` are published automatically after Pages is enabled.

## Edit and validate

- Edit `docs/index.html` for the main page and `docs/about/index.html` for About.
- Styles are in `docs/*.css`; artwork and fonts are in `docs/assets/`.
- `docs/app.js` handles the site interface; `docs/scenery-scroll.js` handles scroll scenery.
- `docs/spiral-drawing.js` and `docs/spiral-recognition.js` implement the drawing activity.

Run the link and JavaScript checks before pushing changes:

```sh
npm run check
```

The checker follows the main and About pages, their stylesheets, images and module imports. It verifies local links and anchors at both `/` and `/myvillageshikha/`, rejects unused files in `docs/assets/`, then checks the syntax of the active JavaScript files. Preview the result on desktop and mobile when changing layouts or interactions.

## Website assets

The site includes only the 17 assets used by My Village Shikha: five cast portraits, the village and forest backgrounds, bushes, a side-view waterfall and foam, three decorative woodland animals, a Nepal map, a cardboard burrow rim, the Permanent Marker heading font, and the supplied background music.

## Background music

`docs/assets/shikha-background-music.mp3` is the supplied “सूरज की किरणें (1).mp3” track. Both pages play it on a loop at a gentle default volume and provide a Play/Pause music button. The site attempts playback on load; if the browser blocks audible autoplay, playback starts with the first click, tap or keyboard interaction. An explicit Music off choice is remembered on the device.

The heading font's attribution and license are included in [docs/licenses/](docs/licenses/README.md).

Local HTML and CSS links use relative paths so the site works both at a domain root and under the GitHub repository path.

## Story and animation copyright

© 2026 My Village Shikha. Story and animation. All rights reserved.

See [COPYRIGHT.md](COPYRIGHT.md) for the notice. The heading font and map data retain their existing licenses and attribution notices.

A decorative cardboard red panda crosses the forest path with four separately animated legs as you scroll, and the waterfall has fifteen independently phased foam layers. Both scenes support reduced motion. Run npm run test:scenery to verify scroll behavior. See FOREST-VISITOR-ARTWORK.md for the character asset and generation prompt.

The owl flaps its hinged cardboard wings as you scroll. Two fox cubs peek out beside the adult fox with a short stagger. Reduced motion leaves both scenes still. See FOREST-FAMILY-ARTWORK.md for the cub artwork and prompts.

Both pages begin with a spiral loading screen. It promotes lazy artwork to eager loading, decodes HTML/SVG/CSS images, loads the heading font and waits for deferred scripts before revealing the completed page. Audio buffering does not block the visual reveal. Slow or failed requests offer manual entry and retry controls; the page remains readable without JavaScript. Run `node scripts/test-site-loader.mjs` to check the loading gate.
