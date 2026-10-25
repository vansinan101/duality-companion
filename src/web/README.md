# Duality Companion: setting up the website

The site is one page (`index.html`) on GitHub Pages, with shared saving through Firebase. It's the same setup as the Clockwork Companion; you can reuse your Firebase account but use a **new Firebase project**, so the two games never share a database.

## 1. Firebase (free Spark plan, no card)
1. Go to console.firebase.google.com → **Add project** (e.g. `duality-companion`).
2. **Firestore Database** → Create database → production mode → an EU location.
3. **Firestore → Rules**: paste the contents of `firestore.rules`, then **Publish**.
4. **Authentication** → Sign-in method → turn on **Email/Password**. (Players never type an email; the app makes one up from their username.)
5. **Project settings → Your apps → `</>`** (add a web app). Copy the settings into `firebase-config.js`.

## 2. GitHub Pages
The repository publishes itself: `.github/workflows/pages.yml` builds `main` into the site root and `Dev` into `/dev/` and pushes both to the `gh-pages` branch.
1. Put your Firebase settings in `firebase-config.js` at the repository root (through a pull request, like any change).
2. Settings → Pages → Deploy from a branch → `gh-pages` / root (the branch appears after the first publish).
3. Hard-refresh (Ctrl + Shift + R) after each update.

## 3. First use
1. The GM signs up with a username and password, types a new **table password**, and taps **Create a new table**. The creator is the GM.
2. Players sign up with the same table password. Their characters are theirs; the GM sees everyone's and can hand characters over.

Without settings in `firebase-config.js`, the page still works, saving to that browser only.

## Licence
This site uses the Daggerheart SRD 2.0 under the Darrington Press Community Gaming License. Keep the table password private: a private group's tool is "private play" under the licence. A public site needs written permission from Darrington Press first. See `ATTRIBUTION.md`.
