import { describe, expect, it } from "vitest";
import { FOODS } from "@/constants/foods";
import { normalizeFoodSearch, searchFoods } from "./foodSearch";
import type { Food } from "@/types/domain";

const food = (name: string, id = name, preparationBasis?: Food["preparationBasis"]): Food => ({ ...FOODS[0], id, name, preparationBasis });
const names = (query: string, foods = FOODS) => searchFoods(foods, query).map(match => match.food.name);

describe("food picker search", () => {
  it.each([["eggs", "Egg"], ["potatoes", "Sweet potato"], ["blueberry", "Blueberries"], ["rice", "White rice"]])("matches %s without altering source values", (query, expected) => {
    expect(names(query)).toContain(expected);
  });
  it("normalizes punctuation, whitespace, accents and case", () => {
    expect(normalizeFoodSearch("  CRÈME--Brûlée! ")).toBe("creme brulee");
    expect(names("creme brulee", [food("Crème brûlée")])).toEqual(["Crème brûlée"]);
    expect(names("  CHICKEN,   BREAST ")).toContain("Chicken breast");
    expect(names("breasts chicken")).toContain("Chicken breast");
  });
  it("requires every query token and does not conflate short words or preparation", () => {
    const foods = [food("Chicken breast", "c", "cooked"), food("Chicken breast", "r", "raw"), food("Fat"), food("Eggplant")];
    expect(searchFoods(foods, "raw chicken").map(match => match.food.id)).toEqual(["r"]);
    expect(searchFoods(foods, "cooked chicken").map(match => match.food.id)).toEqual(["c"]);
    expect(names("raw", [food("Fat")])).toEqual([]);
    expect(names("eggs", [food("Eggplant")])).toEqual([]);
    expect(names("chicken chocolate", foods)).toEqual([]);
    expect(names("chicken chicken", foods)).toEqual([]);
    expect(names("cooked rice", [food("Uncooked rice")])).toEqual([]);
  });
  it("ranks exact phrases, plural-equivalent tokens, prefixes and spelling matches", () => {
    const foods = [food("Almond"), food("Chicken breast"), food("Chicken"), food("Chickpea"), food("Chiken")];
    expect(searchFoods(foods, "chicken")).toEqual([
      { food: foods[2], kind: "exact" }, { food: foods[1], kind: "exact" }, { food: foods[4], kind: "close" },
    ]);
    expect(searchFoods([food("Blueberries")], "blueber")[0].kind).toBe("prefix");
    expect(searchFoods([food("Chicken")], "chikcen")[0].kind).toBe("close");
    expect(searchFoods([food("Blueberries")], "blueberreis")[0].kind).toBe("close");
    expect(names("rxce", [food("Rice")])).toEqual(["Rice"]);
    expect(names("rxze", [food("Rice")])).toEqual([]);
    expect(names("eg", [food("Egg")])).toEqual(["Egg"]);
    expect(names("egz", [food("Egg")])).toEqual([]);
  });
  it("retains conservative singular forms", () => {
    for (const name of ["Asparagus", "Couscous", "Series", "Rice"]) {
      expect(searchFoods([food(name)], name)[0].kind).toBe("exact");
    }
    expect(names("tomato", [food("Tomatoes")])).toEqual(["Tomatoes"]);
    expect(names("leaf", [food("Leaves")])).toEqual(["Leaves"]);
  });
  it("has deterministic name/ID ties, bounded results, and no duplicates", () => {
    const foods = Array.from({ length: 9 }, (_, i) => food("Egg", String(i)));
    const expected = searchFoods(foods, "eggs");
    expect(expected).toHaveLength(6);
    expect(searchFoods([...foods].reverse(), "eggs")).toEqual(expected);
    expect(searchFoods([foods[0], foods[0]], "eggs")).toHaveLength(1);
    expect(searchFoods(foods, "")).toEqual([]);
    expect(searchFoods(foods, "   ")).toEqual([]);
    expect(searchFoods(foods, "eggs", 0)).toEqual([]);
  });
});
