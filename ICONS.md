# Creating Icon Files

The extension requires three icon files in the `icons/` folder:
- icon16.png (16x16 pixels)
- icon48.png (48x48 pixels)  
- icon128.png (128x128 pixels)

## Quick Option: Using Online Tools

### Option 1: Favicon.io
1. Go to https://favicon.io/favicon-generator/
2. Choose a simple design (e.g., text "REC" or a video camera emoji 📹)
3. Download the generated icons
4. Rename and resize as needed

### Option 2: Manual Creation

You can use any image editor (Paint, GIMP, Photoshop, etc.):

1. Create a new image with the required dimensions
2. Add a simple design:
   - Red circle with "REC" text
   - Video camera icon
   - Queue/list icon
   - Any simple recognizable symbol
3. Save as PNG
4. Create all three sizes

## Temporary Workaround (For Testing)

If you just want to test the extension quickly, you can:

1. Create a simple colored square in any image editor
2. Save it as PNG in three sizes
3. Place them in the icons/ folder

The extension will work even with very basic placeholder icons.

## SVG to PNG Conversion (Recommended)

If you have an SVG icon, you can convert it to PNG at different sizes:

### Using Online Tools:
- https://svgtopng.com/
- https://cloudconvert.com/svg-to-png

### Using Command Line (ImageMagick):
```bash
# If you have ImageMagick installed
convert icon.svg -resize 16x16 icons/icon16.png
convert icon.svg -resize 48x48 icons/icon48.png
convert icon.svg -resize 128x128 icons/icon128.png
```

## Simple HTML Icon Generator (Included)

Open `icon-generator.html` in a browser to generate simple placeholder icons automatically.
