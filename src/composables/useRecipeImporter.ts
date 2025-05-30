import { Recipe } from "@/types/Recipe"
import { host } from "@/composables/useState";

export async function getRecipeFromUrl(url: string): Promise<Recipe> {
  const response = await fetch(`${host.value}/scrape`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({ url })
  })

  if (!response.ok) {
    throw new Error('Failed to fetch recipe')
  }

  const data = await response.json()

  if (data.data) {
    return data.data as Recipe
  } else if (data.error) {
    throw new Error(data.error)
  } else {
    throw new Error('Unknown error')
  }
}




  