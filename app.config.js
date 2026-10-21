// CI sets BUILD_NUMBER, so every release gets version 1.0.<build> and a higher versionCode.
const build = Number(process.env.BUILD_NUMBER) || 0;

module.exports = {
  name: 'Računi',
  slug: 'racuni',
  // Google sign-in returns to <package>:/oauthredirect, so the package name must be a scheme too.
  scheme: ['racuni', 'rs.racuni.app'],
  version: `1.0.${build}`,
  orientation: 'portrait',
  icon: './assets/icon.png',
  userInterfaceStyle: 'light',
  ios: {
    supportsTablet: true,
    bundleIdentifier: 'rs.racuni.app',
  },
  android: {
    package: 'rs.racuni.app',
    versionCode: Math.max(build, 1),
    // Lets the app hand a downloaded update to the Android installer.
    permissions: ['android.permission.REQUEST_INSTALL_PACKAGES'],
    adaptiveIcon: {
      backgroundColor: '#E6F4FE',
      foregroundImage: './assets/android-icon-foreground.png',
      backgroundImage: './assets/android-icon-background.png',
      monochromeImage: './assets/android-icon-monochrome.png',
    },
  },
  web: {
    favicon: './assets/favicon.png',
  },
  plugins: [
    'expo-web-browser',
    ['expo-camera', { cameraPermission: 'Kamera služi za skeniranje QR koda na računu.' }],
  ],
};
