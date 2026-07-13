import StoreModule from 'electron-store'
import crypto from 'crypto'

const Store = StoreModule.default || StoreModule

const ENCRYPTION_KEY = 'db-sync-secure-key-32chars-longx'

const store = new Store({
  name: 'db-sync-config',
  encryptionKey: ENCRYPTION_KEY
})

export function saveProfile(profile) {
  const profiles = store.get('profiles', [])
  const existingIndex = profiles.findIndex((p) => p.id === profile.id)

  if (existingIndex >= 0) {
    profiles[existingIndex] = profile
  } else {
    profile.id = crypto.randomUUID()
    profiles.push(profile)
  }

  store.set('profiles', profiles)
  return profile
}

export function getProfiles() {
  return store.get('profiles', [])
}

export function deleteProfile(id) {
  const profiles = store.get('profiles', [])
  store.set(
    'profiles',
    profiles.filter((p) => p.id !== id)
  )
}

export function getSyncHistory() {
  return store.get('syncHistory', [])
}

export function addSyncHistory(entry) {
  const history = store.get('syncHistory', [])
  history.unshift({ ...entry, id: crypto.randomUUID(), timestamp: new Date().toISOString() })
  // Keep only last 50 entries
  store.set('syncHistory', history.slice(0, 50))
}
