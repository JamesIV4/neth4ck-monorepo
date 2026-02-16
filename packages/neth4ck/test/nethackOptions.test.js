import { describe, expect,it } from "vitest";

import { createNethackOptions } from "../src/nethackOptions.js";

describe("createNethackOptions", () => {
    it("returns empty string for empty options", () => {
        expect(createNethackOptions({})).toBe("");
    });

    it("formats boolean option when true", () => {
        expect(createNethackOptions({ autoquiver: true })).toBe("autoquiver");
    });

    it("formats boolean option when false", () => {
        expect(createNethackOptions({ autoquiver: false })).toBe("!autoquiver");
    });

    it("formats string option", () => {
        expect(createNethackOptions({ name: "TestHero" })).toBe("name:TestHero");
    });

    it("combines multiple options with commas", () => {
        const result = createNethackOptions({ autoquiver: true, name: "TestHero" });
        expect(result).toBe("autoquiver,name:TestHero");
    });

    it("throws for unrecognized option", () => {
        expect(() => createNethackOptions({ bogus: "value" })).toThrow(
            "NetHack option not recognized: bogus",
        );
    });

    it("throws for wrong type on boolean option", () => {
        expect(() => createNethackOptions({ autoquiver: "yes" })).toThrow(
            "Expected NetHack option 'autoquiver' to be boolean",
        );
    });

    it("throws for wrong type on string option", () => {
        expect(() => createNethackOptions({ name: 42 })).toThrow(
            "Expected NetHack option 'name' to be string",
        );
    });
});
