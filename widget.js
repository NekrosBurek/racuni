// Home screen widget (Android): this month's spending, the budget bar, the next installment and a scan button.
// The app pushes a fresh summary whenever receipts load; it's also kept in the encrypted store so Android can redraw
// the widget (added, resized, rebooted) while the app is closed.
import { FlexWidget, TextWidget, requestWidgetUpdate } from 'react-native-android-widget';
import * as SecureStore from 'expo-secure-store';

export const WIDGET_NAME = 'Potrosnja';
const STORE_KEY = 'widget-summary';

const money = n => n.toLocaleString('sr-RS', { maximumFractionDigits: 0 });

function SpendingWidget({ summary }) {
  const s = summary;
  const over = s && s.budget && s.ratio >= 1;
  const near = s && s.budget && !over && s.ratio >= 0.8;
  const barColor = over ? '#ff6b6b' : near ? '#f0a040' : '#7cb3ff';
  return (
    <FlexWidget
      clickAction="OPEN_APP"
      style={{ height: 'match_parent', width: 'match_parent', backgroundColor: '#181b20', borderRadius: 20, padding: 14, flexDirection: 'column', justifyContent: 'space-between' }}>
      <FlexWidget style={{ width: 'match_parent', flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
        <TextWidget text={s ? `Računi · ${s.month}` : 'Računi'} style={{ fontSize: 13, color: '#a6adb7' }} />
        <FlexWidget clickAction="OPEN_APP" style={{ backgroundColor: '#2f6fd0', borderRadius: 14, paddingHorizontal: 12, paddingVertical: 6 }}>
          <TextWidget text="📷 Skeniraj" style={{ fontSize: 13, color: '#ffffff', fontWeight: 'bold' }} />
        </FlexWidget>
      </FlexWidget>
      {s ? (
        <FlexWidget style={{ width: 'match_parent', flexDirection: 'column' }}>
          <TextWidget text={`${money(s.spent)} RSD`} style={{ fontSize: 26, color: '#e8eaed', fontWeight: 'bold' }} />
          {s.budget ? (
            <FlexWidget style={{ width: 'match_parent', flexDirection: 'column', marginTop: 6 }}>
              <FlexWidget style={{ width: 'match_parent', height: 8, flexDirection: 'row', backgroundColor: '#2c313a', borderRadius: 4 }}>
                <FlexWidget style={{ flex: Math.max(0.01, Math.min(1, s.ratio)), height: 8, backgroundColor: barColor, borderRadius: 4 }} />
                <FlexWidget style={{ flex: Math.max(0, 1 - s.ratio), height: 8 }} />
              </FlexWidget>
              <TextWidget
                text={over ? `Budžet ${money(s.budget)} prekoračen za ${money(s.spent - s.budget)}` : `Ostalo ${money(s.budget - s.spent)} od ${money(s.budget)}`}
                style={{ fontSize: 12, color: over ? '#ff6b6b' : '#a6adb7', marginTop: 4 }}
              />
            </FlexWidget>
          ) : (
            <TextWidget text={`${s.count} računa ovog meseca`} style={{ fontSize: 12, color: '#a6adb7' }} />
          )}
        </FlexWidget>
      ) : (
        <TextWidget text="Otvori aplikaciju da se učitaju računi." style={{ fontSize: 13, color: '#a6adb7' }} />
      )}
      {s?.nextRate ? (
        <TextWidget
          text={`💳 ${new Date(s.nextRate.due).toLocaleDateString('sr-RS', { month: 'short' })}: ${money(s.nextRate.amount)} RSD · ${s.nextRate.label}`}
          style={{ fontSize: 12, color: '#a6adb7' }}
          maxLines={1}
          truncate="END"
        />
      ) : null}
    </FlexWidget>
  );
}

async function storedSummary() {
  try {
    return JSON.parse((await SecureStore.getItemAsync(STORE_KEY)) ?? 'null');
  } catch {
    return null;
  }
}

// From the app: store the summary and redraw any widgets on the home screen.
export async function updateWidget(summary) {
  try {
    await SecureStore.setItemAsync(STORE_KEY, JSON.stringify(summary));
    await requestWidgetUpdate({ widgetName: WIDGET_NAME, renderWidget: () => <SpendingWidget summary={summary} /> });
  } catch {
    // no widget support (e.g. iOS) or none placed: nothing to update
  }
}

// From Android, also while the app is closed: draw the widget from the last stored summary.
export async function widgetTaskHandler({ widgetAction, renderWidget }) {
  if (widgetAction === 'WIDGET_DELETED') return;
  renderWidget(<SpendingWidget summary={await storedSummary()} />);
}
