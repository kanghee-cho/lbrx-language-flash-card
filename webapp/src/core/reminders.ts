const STORAGE_KEY = 'lbrx.reminders'
const LAST_NOTIFIED_KEY = 'lbrx.reminders.lastNotifiedDate'

export interface ReminderSettings {
  enabled: boolean
}

function readSettings(): ReminderSettings {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    return raw ? (JSON.parse(raw) as ReminderSettings) : { enabled: false }
  } catch {
    return { enabled: false }
  }
}

export function getReminderSettings(): ReminderSettings {
  return readSettings()
}

export function setRemindersEnabled(enabled: boolean): void {
  localStorage.setItem(STORAGE_KEY, JSON.stringify({ enabled }))
}

export function isNotificationSupported(): boolean {
  return typeof window !== 'undefined' && 'Notification' in window
}

export async function requestNotificationPermission(): Promise<NotificationPermission> {
  if (!isNotificationSupported()) {
    return 'denied'
  }
  return Notification.permission === 'granted' ? 'granted' : await Notification.requestPermission()
}

/**
 * Best-effort local review reminder: while the app is open, checks once per
 * calendar day whether any cards are due and shows a Notification if the
 * user opted in and granted permission. There is no real background push in
 * this static-PWA architecture (iOS in particular does not support it), so
 * this only fires during an active/foregrounded session.
 */
export function maybeNotifyDueCards(totalDueCards: number): void {
  if (!isNotificationSupported() || Notification.permission !== 'granted') {
    return
  }
  if (!getReminderSettings().enabled || totalDueCards <= 0) {
    return
  }

  const today = new Date().toISOString().slice(0, 10)
  if (localStorage.getItem(LAST_NOTIFIED_KEY) === today) {
    return
  }

  new Notification('Flash cards due', {
    body: `You have ${totalDueCards} card${totalDueCards === 1 ? '' : 's'} ready to review.`,
    tag: 'lbrx-due-reminder',
  })
  localStorage.setItem(LAST_NOTIFIED_KEY, today)
}
