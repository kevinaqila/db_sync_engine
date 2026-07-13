const fs = require('fs');
const path = require('path');

const filesToFix = [
  'src/renderer/src/components/connection/ProfileForm.vue',
  'src/renderer/src/components/views/HistoryView.vue',
  'src/renderer/src/components/views/WelcomeView.vue',
  'src/renderer/src/components/sync/SyncModal.vue'
];

filesToFix.forEach(file => {
  let content = fs.readFileSync(file, 'utf8');
  
  // Replace old tailwind hacks
  content = content.replace(/text-white/g, 'text-gray-900');
  content = content.replace(/text-\[#666666\]/g, 'text-gray-500');
  content = content.replace(/text-black/g, 'text-gray-900');
  
  content = content.replace(/bg-white/g, 'bg-white');
  content = content.replace(/bg-\[#f0f0f0\]/g, 'bg-gray-50');
  content = content.replace(/bg-\[#21262d\]/g, 'bg-gray-100');
  
  content = content.replace(/border-\[#cccccc\]/g, 'border-gray-200');
  content = content.replace(/border-\[#999999\]/g, 'border-gray-300');
  content = content.replace(/border-\[#21262d\]/g, 'border-gray-200');
  
  fs.writeFileSync(file, content);
});
console.log("Fixed colors");
