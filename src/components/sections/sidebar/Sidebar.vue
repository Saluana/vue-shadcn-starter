<script setup lang="ts">
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarGroupLabel,
  SidebarGroupContent,
  SidebarHeader,
  SidebarMenuItem,
  SidebarMenuButton,
  SidebarGroupAction,
  SidebarMenuAction,
} from "@/components/ui/sidebar";
import SearchInput from "./SearchInput.vue";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";
import {
  MoreHorizontal,
  ChevronDown,
  BookMarked,
  BookPlus,
  Album,
  Search,
  Trash,
} from "lucide-vue-next";
import {
  getLiveHistory,
  getLiveFavourites,
  Favourite,
  getLiveCollections,
  CollectionWithRecipes,
  batchGetRecipes,
  updateCollection,
  getCollectionById,
  RecipeData,
  deleteFavouriteById,
  deleteCollectionById,
  moveHistoryToTrash,
  getRecipeById,
  addFavouriteByRecipeId,
} from "@/composables/useDexie";
import { ref, onMounted } from "vue";
import {
  Plus,
  Heart,
  History as HistoryIcon,
  Bookmark as BookmarkIcon,
} from "lucide-vue-next";
import { type History } from "@/composables/useDexie";
import {
  getRecipeEmbedding,
  ensureEmbeddingsExistForRecipes,
} from "@/composables/useEmbeddings";
import { exportDatabase, importDatabase } from "@/composables/useImportExport";
// Use liveQuery for reactive history updates
const liveHistory = getLiveHistory();
const liveFavourites = getLiveFavourites();
const liveCollections = getLiveCollections();
const history = ref<History[]>([]);
const favourites = ref<Favourite[]>([]);
const recipe = ref<Recipe | null>(null);
const collections = ref<CollectionWithRecipes[]>([]);
const isRecipeModalOpen = ref(false);
// Add loading states for each section
const isHistoryLoading = ref(true);
const isFavouritesLoading = ref(true);
const isCollectionsLoading = ref(true);
import RecipeCard from "@/components/sections/cards/RecipeCard.vue";
import { type Recipe } from "@/types/Recipe";
import { getRecipeFromUrl } from "@/composables/useRecipeImporter";
import { getRecipeByURL, addFavourite } from "@/composables/useDexie";
import { useRoute } from "vue-router";
import NewCollection from '@/components/sections/dialogues/NewCollection.vue'
import SelectCollection from '@/components/sections/dialogues/SelectCollection.vue'
import SelectRecipe from '@/components/sections/dialogues/SelectRecipe.vue'
import DeleteConfirmation from '@/components/sections/dialogues/DeleteConfirmation.vue'
import { isOnline } from '@/composables/useState';
const isRecipeSelectModalOpen = ref(false);
const isCollectionModalOpen = ref(false);
const selectCollectionOpen = ref(false);
const isDeleteConfirmationOpen = ref(false);
const collectionToDelete = ref<number | null>(null);
const collectionNameToDelete = ref('');
const currentCollectionId = ref<number | null>(null);
const currentRecipe = ref<History | null>(null);
const searchResults = ref<{ recipeId: number; title: string }[]>([]);
const restoreInput = ref<HTMLInputElement | null>(null);

const handleRestore = () => {
  if (!restoreInput.value) return;
  restoreInput.value.click();
};

const handleCollectionSelected = (collectionId: number) => {
  selectCollectionOpen.value = false;
};

function handleRecipeSelected(recipe: History) {
  console.log(recipe);
  currentRecipe.value = recipe;
}

function trashHistory(historyId: number) {
  moveHistoryToTrash(historyId);
}

const handleDeleteConfirmation = async () => {
  if (collectionToDelete.value) {
    await deleteCollectionById(collectionToDelete.value);
    collectionToDelete.value = null;
    isDeleteConfirmationOpen.value = false;
  }
}

async function handleSelectRecipeUpdate(url: string) {
  const localRecipe = await getRecipeByURL(url);
  console.log("[handleSelectRecipeUpdate] localRecipe", localRecipe);

  if (localRecipe.length > 0) {
    console.log("[handleSelectRecipeUpdate] localRecipe", localRecipe);
    const recipe = localRecipe[0];
    console.log("[handleSelectRecipeUpdate] recipe", recipe);
    console.log(
      "[handleSelectRecipeUpdate] before",
      recipe.id,
      currentCollectionId.value
    );
    if (!recipe.id || !currentCollectionId.value) return;
    console.log(
      "[handleSelectRecipeUpdate] adding recipe to collection",
      recipe.id,
      currentCollectionId.value
    );
    await addRecipeToCollection(recipe.id, currentCollectionId.value);
    console.log(
      "[handleSelectRecipeUpdate] added recipe to collection",
      recipe.id,
      currentCollectionId.value
    );
    // Only reset currentCollectionId after successfully adding to collection
    setTimeout(() => {
      currentCollectionId.value = null;
    }, 500); // Small delay to ensure operation completes
  }
}

const route = useRoute();

// Subscribe to live history updates
onMounted(() => {
  // Initialize with current data
  liveHistory.subscribe(
    async (result) => {
      history.value = result.reverse();

      if (isOnline.value) {
        await ensureEmbeddingsExistForRecipes(result.map((h) => h.recipeId));
      }

      isHistoryLoading.value = false;
    },
    (error) => {
      console.error("Error in history subscription:", error);
    }
  );

  liveFavourites.subscribe(
    (result) => {
      favourites.value = result;
      isFavouritesLoading.value = false;
    },
    (error) => {
      console.error("Error in favourites subscription:", error);
    }
  );

  liveCollections.subscribe(
    async (result) => {
      collections.value = await Promise.all(
        result.map(async (collection) => {
          const col = { ...collection } as unknown as CollectionWithRecipes;
          col.recipes = [];
          const recipes = await batchGetRecipes(collection.recipes);

          col.recipes = recipes
            .map((recipe) => {
              if (!recipe || recipe.id === undefined) {
                return null;
              }

              return {
                id: recipe.id,
                title: recipe.title,
                url: recipe.url,
              };
            })
            .filter(
              (item): item is { id: number; title: string; url: string } =>
                item !== null
            );

          return col;
        })
      );
      isCollectionsLoading.value = false;
    },
    (error) => {
      console.error("Error in collections subscription:", error);
    }
  );

  // Check for URL parameter to open recipe
  if (route.params.url) {
    openRecipe(route.params.url as string);
  }
});

const openRecipe = async (url: string) => {
  if (url) {
    const localRecipe = await getRecipeByURL(url);
    if (localRecipe[0]) {
      recipe.value = localRecipe[0];
      isRecipeModalOpen.value = true;
    } else {
      recipe.value = await getRecipeFromUrl(url);
      isRecipeModalOpen.value = true;
    }
  }
};

const openRecipeById = async (id: number) => {
  console.log("openRecipeById pre", id);
  if (id) {
    const localRecipe = await getRecipeById(id);
    console.log(localRecipe);
    if (localRecipe) {
      recipe.value = localRecipe;
      isRecipeModalOpen.value = true;
    }
  }
};

const addRecipeToCollection = async (
  recipeId: number,
  collectionId: number
) => {
  const collection = await getCollectionById(collectionId);

  if (!collection) {
    return;
  }

  if (!collection.recipes.includes(recipeId)) {
    collection.recipes.push(recipeId);
    await updateCollection(collection);
  }
};

const handleSearch = (results: { recipeId: number; title: string }[]) => {
  console.log(results);
  searchResults.value = results;
};

const handleSearchChange = (query: string) => {
  if (query.length === 0) {
    searchResults.value = [];
  }
};

const handleRestoreChange = (e: Event) => {
  const file = (e.target as HTMLInputElement).files?.[0];
  if (!file) return;
  importDatabase(file);
};
</script>

<template>
  <Sidebar
    variant="sidebar"
    class="border-r border-border bg-card/30 dark:bg-card/10 overflow-hidden scrollbar-gutter-stable"
  >
    <SidebarHeader class="p-4 border-b border-border/50">
      <div class="flex items-center space-x-3">
        <div
          class="h-10 w-10 border-none flex-shrink-0 flex items-center justify-center text-white font-bold text-lg"
        >
          <img src="/fr-logo.png" alt="Recipe Scraper Logo" class="w-10 h-10" />
        </div>
        <input type="text" class="hidden" />
        <SearchInput @onSearch="handleSearch" @onChange="handleSearchChange" />
      </div>
    </SidebarHeader>
    <SidebarContent
      class="px-2 py-1 space-y-6 overflow-y-auto scrollbar-gutter-stable"
    >
      <SidebarGroup v-if="searchResults.length > 0" class="pb-3">
        <SidebarGroupLabel
          class="text-base font-semibold text-foreground mb-2 px-1"
          >Search Results</SidebarGroupLabel
        >
        <SidebarGroupContent class="list-none space-y-1 pl-0">
          <SidebarMenuItem
            v-for="item in searchResults"
            :key="item.recipeId"
            class="list-none w-full mb-1 last:mb-0"
          >
            <SidebarMenuButton
              @click="openRecipeById(item.recipeId)"
              class="w-full px-2 py-1.5 rounded-md hover:bg-muted text-sm"
            >
              <HistoryIcon
                class="h-3.5 w-3.5 flex-shrink-0 text-muted-foreground"
              />
              <span class="truncate">{{ item.title }}</span>
            </SidebarMenuButton>
          </SidebarMenuItem>
        </SidebarGroupContent>
      </SidebarGroup>
      <SidebarGroup class="pb-3">
        <SidebarGroupLabel
          class="text-base font-semibold text-foreground mb-2 px-1"
          >Favourites</SidebarGroupLabel
        >
        <SidebarGroupContent class="list-none w-full space-y-1 pl-0">
          <div v-if="isFavouritesLoading">
            <!-- Skeleton loaders for favourites -->
            <div
              v-for="i in 3"
              :key="i"
              class="flex items-center mb-1 px-2 py-1.5 rounded-md"
            >
              <div
                class="h-3.5 w-3.5 rounded-full bg-slate-200 dark:bg-slate-700 animate-pulse mr-2 flex-shrink-0"
              ></div>
              <div
                class="h-4 bg-slate-200 dark:bg-slate-700 animate-pulse rounded w-full"
              ></div>
              <div class="h-6 w-6 ml-1 bg-transparent"></div>
            </div>
          </div>
          <div
            v-else-if="favourites.length === 0"
            class="px-2 py-3 text-center rounded-md"
          >
            <div class="text-sm text-muted-foreground">No favorites yet</div>
            <div class="text-xs text-muted-foreground mt-1">
              Heart a recipe to save it here
            </div>
          </div>
          <SidebarMenuItem
            v-else
            v-for="item in favourites"
            :key="item.id"
            class="list-none w-full mb-1 last:mb-0"
          >
            <SidebarMenuButton
              @click="openRecipe(item.url)"
              class="w-full px-2 py-1.5 rounded-md hover:bg-muted text-sm group"
            >
              <Heart
                class="h-3.5 w-3.5 flex-shrink-0 fill-emerald-500 text-emerald-500/80 group-hover:text-emerald-600"
              />
              <span class="truncate">{{ item.title }}</span>
            </SidebarMenuButton>
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <SidebarMenuAction
                  class="h-6 w-6 hover:bg-muted rounded-sm opacity-70 hover:opacity-100"
                >
                  <MoreHorizontal class="h-3.5 w-3.5" />
                </SidebarMenuAction>
              </DropdownMenuTrigger>
              <DropdownMenuContent side="right" align="start" class="w-48">
                <DropdownMenuItem
                  @click="
                    handleRecipeSelected(item);
                    selectCollectionOpen = true;
                  "
                  class="cursor-pointer"
                >
                  <BookPlus class="h-3.5 w-3.5 mr-2 text-muted-foreground" />
                  <span>Add to Collection</span>
                </DropdownMenuItem>
                <DropdownMenuItem
                  v-if="item.id"
                  @click="deleteFavouriteById(item?.id)"
                  class="cursor-pointer text-destructive focus:text-destructive"
                >
                  <Heart class="h-3.5 w-3.5 mr-2" />
                  <span>Remove Favourite</span>
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </SidebarMenuItem>
        </SidebarGroupContent>
      </SidebarGroup>
      <SidebarGroup class="pb-3">
        <div class="flex items-center justify-between mb-2">
          <SidebarGroupLabel class="text-base font-semibold text-foreground"
            >Collections</SidebarGroupLabel
          >
          <SidebarGroupAction
            @click="isCollectionModalOpen = true"
            title="Add Collection"
            class="h-[28px] w-[28px] hover:bg-muted rounded-sm"
          >
            <Plus class="h-[24px] w-[24px]" /> <span class="sr-only">Add Collection</span>
          </SidebarGroupAction>
        </div>
        <SidebarGroupContent class="space-y-1 pl-0">
          <div v-if="isCollectionsLoading">
            <!-- Skeleton loaders for collections -->
            <div v-for="i in 2" :key="i" class="mb-2">
              <div class="flex items-center px-2 py-1.5 rounded-md">
                <div
                  class="h-3.5 w-3.5 rounded-sm bg-slate-200 dark:bg-slate-700 animate-pulse mr-2 flex-shrink-0"
                ></div>
                <div
                  class="h-4 bg-slate-200 dark:bg-slate-700 animate-pulse rounded w-full"
                ></div>
                <div
                  class="h-4 w-4 ml-2 bg-slate-200 dark:bg-slate-700 animate-pulse rounded"
                ></div>
              </div>
              <!-- Skeleton for collection items -->
              <div class="pl-6 pt-1 space-y-1" v-if="i === 1">
                <div
                  v-for="j in 2"
                  :key="j"
                  class="flex items-center px-2 py-1 rounded-md"
                >
                  <div
                    class="h-3 bg-slate-200 dark:bg-slate-700 animate-pulse rounded w-full"
                  ></div>
                </div>
              </div>
            </div>
          </div>
          <div
            v-else-if="collections.length === 0"
            class="px-2 py-3 text-center rounded-md"
          >
            <div class="text-sm text-muted-foreground">No collections yet</div>
            <div class="text-xs text-muted-foreground mt-1">
              Create a collection to organize recipes
            </div>
          </div>
          <Collapsible
            v-else
            v-for="collection in collections"
            :key="collection.id"
            class="group/collapsible mb-3 last:mb-0 !w-full border-l-2 border-emerald-600"
          >
            <SidebarGroup
              class="!p-0 border-l-0 border-r-0 border-t-0 border-b border-border/30 pb-1 mb-1 last:border-b-0 last:mb-0 last:pb-0"
            >
              <SidebarGroupLabel asChild>
                <CollapsibleTrigger
                  class="flex items-center w-full group/trigger px-2 py-1.5 rounded-md hover:bg-muted text-sm font-medium relative"
                >
                  <BookMarked class="h-3.5 w-3.5 mr-2 text-muted-foreground" />
                  <span
                    class="truncate font-normal !text-base text-foreground/80 mr-8"
                    >{{ collection.name }}</span
                  >
                  <ChevronDown
                    class="ml-auto transition-transform group-data-[state=open]/collapsible:rotate-180 h-4 w-4 text-muted-foreground absolute right-2"
                  />
                  <div class="flex items-center gap-[1px] absolute right-7">
                    <!-- Add recipe button that appears on hover -->
                    <button
                      v-if="collection.id"
                      @click.stop="
                        currentCollectionId = collection.id;
                        isRecipeSelectModalOpen = true;
                      "
                      class="opacity-0 group-hover/trigger:opacity-70 hover:opacity-100 transition-opacity h-[28px] w-[28px] rounded-sm hover:bg-emerald-100 dark:hover:bg-emerald-900/30 hover:text-emerald-600 dark:hover:text-emerald-400 flex items-center justify-center"
                      title="Add recipe to collection"
                    >
                      <BookPlus class="h-[18px] w-[18px]" />
                    </button>
                    <!-- Delete button that appears on hover -->
                    <button
                      v-if="collection.id"
                      @click.stop="
                        collectionToDelete = collection.id;
                        collectionNameToDelete = collection.name;
                        isDeleteConfirmationOpen = true;
                      "
                      class="opacity-0 group-hover/trigger:opacity-70 hover:opacity-100 transition-opacity h-[28px] w-[28px] rounded-sm hover:bg-red-100 dark:hover:bg-red-900/30 hover:text-red-600 dark:hover:text-red-400 flex items-center justify-center"
                      title="Delete collection"
                    >
                      <svg
                        xmlns="http://www.w3.org/2000/svg"
                        width="24"
                        height="24"
                        viewBox="0 0 24 24"
                        fill="none"
                        stroke="currentColor"
                        stroke-width="2"
                        stroke-linecap="round"
                        stroke-linejoin="round"
                        class="h-[18px] w-[18px]"
                      >
                        <path d="M3 6h18" />
                        <path d="M19 6v14c0 1-1 2-2 2H7c-1 0-2-1-2-2V6" />
                        <path d="M8 6V4c0-1 1-2 2-2h4c1 0 2 1 2 2v2" />
                        <line x1="10" x2="10" y1="11" y2="17" />
                        <line x1="14" x2="14" y1="11" y2="17" />
                      </svg>
                    </button>
                  </div>
                </CollapsibleTrigger>
              </SidebarGroupLabel>
              <CollapsibleContent>
                <div class="pt-0.5 -mx-2">
                  <!-- Reset padding and margin to align perfectly -->
                  <SidebarGroupContent class="list-none space-y-1 pl-0">
                    <div
                      v-if="collection.recipes.length === 0"
                      class="px-4 py-2 text-center"
                    >
                      <div class="text-xs text-muted-foreground">
                        No recipes in this collection
                      </div>
                    </div>
                    <SidebarMenuItem
                      v-for="recipe in collection.recipes"
                      :key="recipe.id"
                      class="list-none w-full mb-1 last:mb-0"
                    >
                      <SidebarMenuButton
                        @click="openRecipe(recipe.url)"
                        class="w-full px-2 py-1.5 rounded-md hover:bg-muted text-sm"
                      >
                        <div class="w-3.5 h-3.5 invisible flex-shrink-0"></div>
                        <span class="truncate">{{ recipe.title }}</span>
                      </SidebarMenuButton>
                    </SidebarMenuItem>
                  </SidebarGroupContent>
                </div>
              </CollapsibleContent>
            </SidebarGroup>
          </Collapsible>
        </SidebarGroupContent>
      </SidebarGroup>
      <SidebarGroup class="pb-3">
        <SidebarGroupLabel
          class="text-base font-semibold text-foreground mb-2 px-1"
          >History</SidebarGroupLabel
        >
        <SidebarGroupContent class="list-none space-y-1 pl-0">
          <div v-if="isHistoryLoading">
            <!-- Skeleton loaders for history -->
            <div
              v-for="i in 4"
              :key="i"
              class="flex items-center mb-1 px-2 py-1.5 rounded-md"
            >
              <div
                class="h-3.5 w-3.5 rounded-sm bg-slate-200 dark:bg-slate-700 animate-pulse mr-2 flex-shrink-0"
              ></div>
              <div
                class="h-4 bg-slate-200 dark:bg-slate-700 animate-pulse rounded w-full"
              ></div>
              <div class="h-6 w-6 ml-1 bg-transparent"></div>
            </div>
          </div>
          <div
            v-else-if="history.length === 0"
            class="px-2 py-3 text-center rounded-md"
          >
            <div class="text-sm text-muted-foreground">No history yet</div>
            <div class="text-xs text-muted-foreground mt-1">
              View recipes to see them here
            </div>
          </div>
          <SidebarMenuItem
            v-else
            v-for="item in history"
            :key="item.id"
            class="list-none w-full mb-1 last:mb-0"
          >
            <SidebarMenuButton
              v-if="!item.isTrash"
              @click="openRecipe(item.url)"
              class="w-full px-2 py-1.5 rounded-md hover:bg-muted text-sm"
            >
              <HistoryIcon
                class="h-3.5 w-3.5 flex-shrink-0 text-muted-foreground"
              />
              <span class="truncate">{{ item.title }}</span>
            </SidebarMenuButton>
            <DropdownMenu v-if="!item.isTrash">
              <DropdownMenuTrigger asChild>
                <SidebarMenuAction
                  class="h-6 w-6 hover:bg-muted rounded-sm opacity-70 hover:opacity-100"
                >
                  <MoreHorizontal class="h-3.5 w-3.5" />
                </SidebarMenuAction>
              </DropdownMenuTrigger>
              <DropdownMenuContent side="right" align="start" class="w-48">
                <DropdownMenuItem
                  v-if="item.id"
                  @click="addFavouriteByRecipeId(item.recipeId)"
                  class="cursor-pointer"
                >
                  <Heart class="h-3.5 w-3.5 mr-2 text-primary" />
                  <span>Add to Favourites</span>
                </DropdownMenuItem>
                <DropdownMenuItem
                  @click="
                    handleRecipeSelected(item);
                    selectCollectionOpen = true;
                  "
                  class="cursor-pointer"
                >
                  <BookPlus class="h-3.5 w-3.5 mr-2 text-muted-foreground" />
                  <span>Add to Collection</span>
                </DropdownMenuItem>
                <DropdownMenuItem
                  v-if="item.id"
                  @click="trashHistory(item?.id)"
                  class="cursor-pointer text-destructive focus:text-destructive"
                >
                  <Trash class="h-3.5 w-3.5 mr-2" />
                  <span>Move to Trash</span>
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </SidebarMenuItem>
        </SidebarGroupContent>
      </SidebarGroup>
      <SidebarGroup />
    </SidebarContent>
    <SidebarFooter class="p-4 border-t border-border/50 mt-auto">
      <div class="flex items-center justify-between">
        <div class="text-xs text-muted-foreground">FeastRight Beta v1.0</div>
        <div class="text-xs flex items-center gap-1.5">
          <button
            @click="exportDatabase()"
            class="text-muted-foreground hover:text-foreground transition-colors"
          >
            Backup
          </button>
          <span class="text-border">•</span>
          <button
            @click="handleRestore()"
            class="text-muted-foreground hover:text-foreground transition-colors"
          >
            Restore
          </button>
          <input
            ref="restoreInput"
            type="file"
            class="hidden"
            accept=".json"
            @change="handleRestoreChange"
          />
        </div>
      </div>
    </SidebarFooter>
  </Sidebar>

  <RecipeCard
    v-if="recipe"
    :recipe="recipe"
    :open="isRecipeModalOpen"
    @update:open="
      isRecipeModalOpen = $event;
      recipe = null;
    "
  />

  <NewCollection
    :open="isCollectionModalOpen"
    @update:open="isCollectionModalOpen = $event"
  />

  <SelectCollection
    v-if="currentRecipe"
    v-model:open="selectCollectionOpen"
    :recipe-id="currentRecipe.recipeId"
    @collection-selected="handleCollectionSelected"
  />

  <SelectRecipe
    v-model:open="isRecipeSelectModalOpen"
    @recipe-selected="handleSelectRecipeUpdate"
  />
  
  <DeleteConfirmation
    v-model:open="isDeleteConfirmationOpen"
    title="Delete Collection"
    description="Are you sure you want to delete this collection?"
    delete-button-text="Delete Collection"
    @confirm="handleDeleteConfirmation"
    @cancel="collectionToDelete = null"
  />
</template>

<style scoped>
:deep(li) {
  list-style-type: none;
}

/* Add this to ensure scrollbar space is reserved */
.scrollbar-gutter-stable {
  scrollbar-gutter: stable;
}

/* Optional: Add custom styling for scrollbars */
.scrollbar-gutter-stable::-webkit-scrollbar {
  width: 6px;
}

.scrollbar-gutter-stable::-webkit-scrollbar-track {
  background-color: transparent;
}

.scrollbar-gutter-stable::-webkit-scrollbar-thumb {
  background-color: rgba(0, 0, 0, 0.1);
  border-radius: 3px;
}

.dark .scrollbar-gutter-stable::-webkit-scrollbar-thumb {
  background-color: rgba(255, 255, 255, 0.1);
}
</style>
