<script setup>
import { onMounted } from 'vue'
import { useAppStore } from './stores/appStore'
import TitleBar from './components/layout/TitleBar.vue'
import Sidebar from './components/layout/Sidebar.vue'
import WelcomeView from './components/views/WelcomeView.vue'
import DashboardView from './components/views/DashboardView.vue'
import HistoryView from './components/views/HistoryView.vue'
import ProfileForm from './components/connection/ProfileForm.vue'
import NotificationStack from './components/layout/NotificationStack.vue'

const store = useAppStore()

onMounted(async () => {
  await store.loadProfiles()
  if (store.profiles.length > 0) {
    // Don't auto-select, show welcome
  }
})
</script>

<template>
  <div class="flex flex-col h-screen bg-gray-50 text-gray-900 overflow-hidden font-sans">
    <!-- Custom Title Bar -->
    <TitleBar />

    <!-- Main Content -->
    <div class="flex flex-1 overflow-hidden">
      <!-- Sidebar -->
      <Sidebar />

      <!-- Main Content Area -->
      <main class="flex-1 bg-white overflow-hidden relative">
        <Transition name="fade" mode="out-in">
          <WelcomeView v-if="store.currentView === 'welcome'" />
          <DashboardView v-else-if="store.currentView === 'dashboard'" />
          <ProfileForm 
            v-else-if="store.currentView === 'newProfile' || store.currentView === 'editProfile'" 
            :key="store.currentView === 'editProfile' ? store.editingProfile?.id : 'new'"
            :profile="store.currentView === 'editProfile' ? store.editingProfile : null" 
          />
          <HistoryView v-else-if="store.currentView === 'history'" />
        </Transition>
      </main>
    </div>

    <!-- Notifications -->
    <NotificationStack />
  </div>
</template>
