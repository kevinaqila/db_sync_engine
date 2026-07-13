<script setup>
import { useAppStore } from '../../stores/appStore'
import { CheckCircle, AlertCircle, Info, X } from '@lucide/vue'

const store = useAppStore()
</script>

<template>
  <div class="fixed bottom-6 right-6 z-50 flex flex-col gap-2 pointer-events-none">
    <TransitionGroup name="notification">
      <div
        v-for="notification in store.notifications"
        :key="notification.id"
        class="pointer-events-auto flex items-start gap-3 p-4 min-w-[300px] max-w-sm rounded-lg shadow-lg border backdrop-blur-md"
        :class="{
          'bg-green-500/10 border-green-500/20 text-green-400': notification.type === 'success',
          'bg-red-500/10 border-red-500/20 text-red-400': notification.type === 'error',
          'bg-blue-500/10 border-blue-500/20 text-blue-400': notification.type === 'info',
        }"
      >
        <CheckCircle v-if="notification.type === 'success'" class="w-5 h-5 flex-shrink-0 mt-0.5" />
        <AlertCircle v-if="notification.type === 'error'" class="w-5 h-5 flex-shrink-0 mt-0.5" />
        <Info v-if="notification.type === 'info'" class="w-5 h-5 flex-shrink-0 mt-0.5" />
        
        <p class="flex-1 text-sm font-medium leading-relaxed">{{ notification.message }}</p>
        
        <button 
          @click="store.notifications = store.notifications.filter(n => n.id !== notification.id)"
          class="flex-shrink-0 opacity-70 hover:opacity-100 transition-opacity"
        >
          <X class="w-4 h-4" />
        </button>
      </div>
    </TransitionGroup>
  </div>
</template>

<style scoped>
.notification-enter-active,
.notification-leave-active {
  transition: all 0.3s ease;
}
.notification-enter-from {
  opacity: 0;
  transform: translateX(30px);
}
.notification-leave-to {
  opacity: 0;
  transform: translateY(-30px) scale(0.9);
}
</style>
