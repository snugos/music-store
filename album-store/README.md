# FREEZE 5 — Album Store

A simple, fast album store hosted on GitHub Pages.

## Setup

### 1. Create Stripe Payment Link
1. Create a Stripe account at stripe.com
2. Go to Payment Links → Create Payment Link
3. Set amount to $12 (or your price)
4. Copy the link and replace `YOUR_STRIPE_PAYMENT_LINK_HERE` in `index.html`

### 2. Add Your Track Files
Name your audio files:
- `tracks/track-01.wav`
- `tracks/track-02.wav`
- `tracks/track-03.wav`
- etc.

Create the `tracks/` folder and add your files.

### 3. Update Track Names
Edit the tracklist section in `index.html` with your actual track names and durations.

### 4. Create GitHub Repository
1. Go to github.com and create a new repository named `freeze-5-album`
2. Push this folder to your repository:
   ```bash
   git init
   git add .
   git commit -m "Initial album store"
   git branch -M main
   git remote add origin https://github.com/YOUR_USERNAME/freeze-5-album.git
   git push -u origin main
   ```

### 5. Enable GitHub Pages
1. In your repo, go to Settings → Pages
2. Under "Source", select `main` branch and `/ (root)`
3. Click Save

Your store will be live at: `https://YOUR_USERNAME.github.io/freeze-5-album`

## Customization

- **Price**: Change `$12` in the price section
- **Album art**: Replace the gradient div with an `<img>` tag
- **Colors**: Edit the CSS variables at the top
- **Countdown**: Uncomment the timer code in the script section

## Files

```
album-store/
├── index.html    (the store page)
├── tracks/       (your audio files go here)
└── README.md     (this file)
```
