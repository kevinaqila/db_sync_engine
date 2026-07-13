import { defineStore } from 'pinia'
import { ref, computed } from 'vue'

export const useAppStore = defineStore('app', () => {
  // --- Profiles ---
  const profiles = ref([])
  const activeProfileId = ref(null)
  const activeProfile = computed(() => profiles.value.find((p) => p.id === activeProfileId.value))

  async function loadProfiles() {
    profiles.value = await window.api.profiles.getAll()
  }

  async function saveProfile(profile) {
    const saved = await window.api.profiles.save(profile)
    await loadProfiles()
    return saved
  }

  async function deleteProfile(id) {
    await window.api.profiles.delete(id)
    if (activeProfileId.value === id) activeProfileId.value = null
    await loadProfiles()
  }

  function setActiveProfile(id) {
    if (activeProfileId.value !== id) {
      activeProfileId.value = id
      currentView.value = 'dashboard'
      tables.value = []
      tablesFetched.value = false
    } else {
      currentView.value = 'dashboard'
    }
  }

  // --- View routing ---
  const currentView = ref('welcome') // 'welcome' | 'dashboard' | 'newProfile' | 'editProfile' | 'history'
  const editingProfile = ref(null)

  function openNewProfile() {
    editingProfile.value = null
    currentView.value = 'newProfile'
  }

  function openEditProfile(profile) {
    editingProfile.value = { ...profile }
    currentView.value = 'editProfile'
  }

  function goBack() {
    currentView.value = activeProfileId.value ? 'dashboard' : 'welcome'
  }

  // --- Tables ---
  const tables = ref([])
  const selectedTables = ref([])
  const tableModes = ref({}) // { 'table_name': 'full' | 'structure' }
  const tablesFetched = ref(false)
  const tableLoading = ref(false)
  const tableError = ref(null)

  async function fetchTables() {
    if (!activeProfile.value) return
    tableLoading.value = true
    tableError.value = null
    try {
      const profileData = JSON.parse(JSON.stringify(activeProfile.value))
      const result = await window.api.connection.listTables(profileData)
      if (result.success) {
        tables.value = result.tables
        selectedTables.value = result.tables.map((t) => t.name)
        
        // Initialize modes
        const modes = {}
        result.tables.forEach(t => { modes[t.name] = 'full' })
        tableModes.value = modes
        
        tablesFetched.value = true
      } else {
        tableError.value = result.message
      }
    } catch (e) {
      tableError.value = e.message
    } finally {
      tableLoading.value = false
    }
  }

  function toggleTable(name) {
    const idx = selectedTables.value.indexOf(name)
    if (idx >= 0) selectedTables.value.splice(idx, 1)
    else selectedTables.value.push(name)
  }

  function selectAllTables() {
    selectedTables.value = tables.value.map((t) => t.name)
  }

  function deselectAllTables() {
    selectedTables.value = []
  }

  function setAllTableModes(mode) {
    Object.keys(tableModes.value).forEach(name => {
      tableModes.value[name] = mode
    })
  }

  // --- Notifications ---
  const notifications = ref([])

  function notify(type, message, duration = 4000) {
    const id = Date.now()
    notifications.value.push({ id, type, message })
    setTimeout(() => {
      notifications.value = notifications.value.filter((n) => n.id !== id)
    }, duration)
  }

  // --- Templates ---
  async function saveTemplate(name, selectedTablesData, tableModesData, existingId = null) {
    if (!activeProfile.value) throw new Error('No active profile')
    
    const profile = JSON.parse(JSON.stringify(activeProfile.value))
    if (!profile.templates) profile.templates = []
    
    let tpl
    if (existingId) {
      tpl = profile.templates.find(t => t.id === existingId)
      if (tpl) {
        tpl.name = name
        tpl.selectedTables = [...selectedTablesData]
        tpl.tableModes = JSON.parse(JSON.stringify(tableModesData))
      }
    }
    
    if (!tpl) {
      tpl = {
        id: crypto.randomUUID(),
        name,
        selectedTables: [...selectedTablesData],
        tableModes: JSON.parse(JSON.stringify(tableModesData))
      }
      profile.templates.push(tpl)
    }
    
    await saveProfile(profile)
    return tpl
  }

  async function deleteTemplate(tplId) {
    if (!activeProfile.value || !activeProfile.value.templates) return
    
    const profile = JSON.parse(JSON.stringify(activeProfile.value))
    profile.templates = profile.templates.filter(t => t.id !== tplId)
    await saveProfile(profile)
  }

  return {
    // profiles
    profiles, activeProfileId, activeProfile,
    loadProfiles, saveProfile, deleteProfile, setActiveProfile,
    // views
    currentView, editingProfile,
    openNewProfile, openEditProfile, goBack,
    // tables
    tables, selectedTables, tableModes, tablesFetched, tableLoading, tableError,
    fetchTables, toggleTable, selectAllTables, deselectAllTables, setAllTableModes,
    // notifications
    notifications, notify,
    // templates
    saveTemplate, deleteTemplate
  }
})
