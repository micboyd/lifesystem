import api from './api'
import type { ApiResponse, ShoppingList } from '../types'

/** The nutrition shopping list. Every change answers with the whole list. */

async function list(req: Promise<{ data: ApiResponse<ShoppingList> }>): Promise<ShoppingList> {
    return (await req).data.data
}

export const getShopping = () => list(api.get('/shopping'))

/** Adds it — or one more of it (a batch more, for a box) if it's already on. */
export const addToShopping = (kind: 'meal' | 'food', id: string) => list(api.post('/shopping/add', { kind, id }))

export const addShoppingItem = (name: string) => list(api.post('/shopping/items', { name }))

/** How many batches of a box (or meals, or of a food). */
export const setShoppingCount = (id: string, count: number) => list(api.patch(`/shopping/groups/${id}`, { count }))

export const deleteShoppingGroup = (id: string) => list(api.delete(`/shopping/groups/${id}`))

/** A line into (or out of) the basket. */
export const tickShopping = (name: string, done: boolean) => list(api.post('/shopping/tick', { name, done }))

export const clearShopping = (onlyDone: boolean) => list(api.post('/shopping/clear', { onlyDone }))
