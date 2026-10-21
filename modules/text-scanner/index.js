import { requireNativeView, requireOptionalNativeModule } from 'expo';

// On-device text recognition (Google ML Kit, Latin script) and an in-app receipt camera; null where not built in.
const TextScanner = requireOptionalNativeModule('TextScanner');

export const isAvailable = !!TextScanner;

// Lines of text with their position in the image: [{ text, left, top, right, bottom }].
export function recognizeAsync(uri) {
  return TextScanner.recognizeAsync(uri);
}

// <ReceiptCamera ref torch onFocus={({ nativeEvent: { x, y } }) => …} onReady />; ref.current.takePictureAsync() -> file URI.
export const ReceiptCamera = isAvailable ? requireNativeView('TextScanner') : null;
