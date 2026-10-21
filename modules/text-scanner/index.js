import { requireOptionalNativeModule } from 'expo';

// On-device text recognition (Google ML Kit, Latin script) for paper receipts; null where it isn't built in.
const TextScanner = requireOptionalNativeModule('TextScanner');

export const isAvailable = !!TextScanner;

// Lines of text with their position in the image: [{ text, left, top, right, bottom }].
export function recognizeAsync(uri) {
  return TextScanner.recognizeAsync(uri);
}
