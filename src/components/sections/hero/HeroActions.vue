<script setup lang="ts">
import type { HTMLAttributes } from 'vue'
import { cn } from '@/lib/utils'

const props = defineProps<{
  class?: HTMLAttributes['class']
}>()
</script>

<template>
  <div 
    :class="cn(
      'flex flex-wrap items-center justify-center gap-4',
      props.class
    )"
  >
    <slot />
  </div>
</template> 