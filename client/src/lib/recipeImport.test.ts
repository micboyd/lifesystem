import { describe, it, expect } from 'vitest'
import { validateRecipeImport } from '../../../server/src/lib/recipeImport'

const chicken = { calories: 106, protein: 24, carbs: 0, fat: 1.1 }

const errors = (r: ReturnType<typeof validateRecipeImport>) =>
    r.issues.filter((i) => i.level === 'error').map((i) => i.path)
const warnings = (r: ReturnType<typeof validateRecipeImport>) =>
    r.issues.filter((i) => i.level === 'warning').map((i) => i.path)

describe('validateRecipeImport', () => {
    it('accepts a well-formed recipe', () => {
        const r = validateRecipeImport({
            recipes: [
                {
                    name: 'Lemon chicken',
                    servings: 7,
                    ingredients: [{ name: 'Chicken', amount: 2000, unit: 'g', per100: chicken }],
                },
            ],
        })
        expect(r.issues).toEqual([])
        expect(r.recipes[0].draft.servings).toBe(7)
    })

    it('turns packs into an amount', () => {
        const r = validateRecipeImport({
            recipes: [
                {
                    name: 'Tray',
                    ingredients: [
                        {
                            name: 'Sauce',
                            packs: 0.5,
                            unit: 'g',
                            pack: { size: 500, label: 'jar' },
                            per100: { calories: 80, protein: 1.5, carbs: 12, fat: 3 },
                        },
                    ],
                },
            ],
        })
        expect(r.recipes[0].draft.ingredients[0].amount).toBe(250)
    })

    it('refuses per100 on counted items, and a missing unit', () => {
        const r = validateRecipeImport({
            recipes: [
                {
                    name: 'Eggs',
                    ingredients: [
                        { name: 'Egg', amount: 2, unit: 'item', per100: chicken },
                        { name: 'Milk', amount: 50, per100: chicken },
                    ],
                },
            ],
        })
        expect(errors(r)).toContain('ingredients[0].per100')
        expect(errors(r)).toContain('ingredients[1].unit')
        expect(r.recipes).toEqual([])
    })

    it('needs nutrition from somewhere', () => {
        const r = validateRecipeImport({ recipes: [{ name: 'Mystery', ingredients: [{ name: 'X', amount: 1, unit: 'g' }] }] })
        expect(errors(r)).toContain('ingredients')
    })

    it('flags a label whose kcal disagree with its macros', () => {
        const r = validateRecipeImport({
            recipes: [
                {
                    name: 'Tray',
                    ingredients: [{ name: 'Chicken', amount: 100, unit: 'g', per100: { ...chicken, calories: 400 } }],
                },
            ],
        })
        expect(warnings(r)).toContain('ingredients[0].per100')
        expect(r.recipes).toHaveLength(1)
    })

    it('flags a large gap to the guide’s own estimate', () => {
        const r = validateRecipeImport({
            recipes: [
                {
                    name: 'Tray',
                    servings: 2,
                    guideEstimatePerPortion: { calories: 500, protein: 60, carbs: 0, fat: 5 },
                    ingredients: [{ name: 'Chicken', amount: 1000, unit: 'g', per100: chicken }],
                },
            ],
        })
        // 1,060 kcal ÷ 2 = 530 — within 10% of 500, so fine.
        expect(warnings(r)).not.toContain('guideEstimatePerPortion')
        const off = validateRecipeImport({
            recipes: [
                {
                    name: 'Tray',
                    servings: 1,
                    guideEstimatePerPortion: { calories: 500, protein: 0, carbs: 0, fat: 0 },
                    ingredients: [{ name: 'Chicken', amount: 1000, unit: 'g', per100: chicken }],
                },
            ],
        })
        expect(warnings(off)).toContain('guideEstimatePerPortion')
    })

    it('rejects duplicate names and unknown shapes', () => {
        const base = { name: 'A', macrosPerPortion: { calories: 1, protein: 0, carbs: 0, fat: 0 } }
        expect(errors(validateRecipeImport({ recipes: [base, base] }))).toContain('name')
        expect(errors(validateRecipeImport({ nope: true }))).toEqual([''])
    })
})
