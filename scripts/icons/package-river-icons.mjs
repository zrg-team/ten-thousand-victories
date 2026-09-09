/** Build a portable icon handoff and exercise the installed Expo native icon exporters. */
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import { resolve, join, dirname } from 'node:path';
import { mkdirSync, copyFileSync, cpSync, writeFileSync, readFileSync } from 'node:fs';
import { RIVER_ICON } from './river-icon-pack.mjs';

const root = fileURLToPath(new URL('../../', import.meta.url));
const require = createRequire(join(root, 'apps/mobile/package.json'));
const { setIconAsync } = require('@expo/prebuild-config/build/plugins/icons/withAndroidIcons');
const { generateUniversalIconAsync } = require('@expo/prebuild-config/build/plugins/icons/withIosIcons');
const review = join(root, 'docs/design/game-icon-v7');
const out = join(review, 'icon-pack');
const scratch = join(review, 'native-export-check');
const assets = join(root, 'apps/mobile/assets');
const copy = (from, to) => {
  mkdirSync(dirname(to), { recursive: true });
  copyFileSync(from, to);
};
mkdirSync(scratch, { recursive: true });

// These are the same installed Expo functions called during prebuild, isolated from the app.
await setIconAsync(scratch, {
  icon: join(assets, 'icon.png'),
  foregroundImage: join(assets, 'adaptive-icon.png'),
  monochromeImage: join(assets, 'monochrome-icon.png'),
  backgroundColor: RIVER_ICON.paper,
  backgroundImage: null,
  isAdaptive: true,
});
const nativeRes = join(scratch, 'android/app/src/main/res');
mkdirSync(join(nativeRes, 'values'), { recursive: true });
writeFileSync(join(nativeRes, 'values/colors.xml'), `<?xml version="1.0" encoding="utf-8"?>\n<resources><color name="iconBackground">${RIVER_ICON.paper}</color></resources>\n`);
cpSync(nativeRes, join(out, 'android/res'), { recursive: true });

const iosRoot = join(scratch, 'ios/RiverIcon');
const iosSet = join(iosRoot, 'Images.xcassets/AppIcon.appiconset');
mkdirSync(iosSet, { recursive: true });
const iosImages = [];
for (const [name, appearance] of [['icon.png', undefined], ['icon-tinted.png', 'tinted']]) {
  iosImages.push(await generateUniversalIconAsync(scratch, {
    icon: join(assets, name), cacheKey: `river-v7-${appearance || 'light'}`,
    iosNamedProjectRoot: iosRoot, platform: 'ios', appearance,
  }));
}
writeFileSync(join(iosSet, 'Contents.json'), JSON.stringify({ images: iosImages, info: { version: 1, author: 'xcode' } }, null, 2) + '\n');
cpSync(iosSet, join(out, 'ios/AppIcon.appiconset'), { recursive: true });
for (const name of ['icon.png', 'icon-tinted.png', 'adaptive-icon.png', 'monochrome-icon.png', 'splash.png']) copy(join(assets, name), join(out, 'expo', name));
for (const name of ['favicon.ico', 'favicon-16.png', 'favicon-32.png', 'favicon-48.png', 'favicon-96.png', 'apple-touch-icon.png', 'icon-192.png', 'icon-512.png', 'icon-maskable-192.png', 'icon-maskable-512.png', 'icon.svg', 'icon-maskable.svg', 'favicon.svg', 'manifest.webmanifest', 'app-emblem.webp']) copy(join(root, 'public', name), join(out, 'web', name));
copy(join(root, 'apps/mobile/store/ios/icon/app-store-icon-1024.png'), join(out, 'ios/app-store-icon-1024.png'));
for (const name of ['favicon-river-v9.ico', ...[16, 32, 48, 96].map(size => `favicon-river-v9-${size}.png`)]) copy(join(root, 'public', name), join(out, 'web', name));
copy(join(root, 'apps/mobile/store/android/icon/play-store-icon-512.png'), join(out, 'android/play-store-icon-512.png'));

// A settings excerpt rather than a replacement app configuration.
const exp = JSON.parse(readFileSync(join(root, 'apps/mobile/app.json'), 'utf8')).expo;
writeFileSync(join(out, 'expo/icon-config.json'), JSON.stringify({
  icon: './icon.png',
  ios: { icon: { light: './icon.png', tinted: './icon-tinted.png' } },
  android: { adaptiveIcon: {
    foregroundImage: './adaptive-icon.png', monochromeImage: './monochrome-icon.png',
    backgroundColor: exp.android.adaptiveIcon.backgroundColor,
  } },
}, null, 2) + '\n');
console.log(`Portable icon pack and Expo native exports ready: ${resolve(out)}`);
