import { describe, it, expect } from "vitest";
import {
    format_variables,
    format_call_stack,
    format_location,
    format_variable_diff,
    format_call_stack_diff,
    format_variable_change_summary,
} from "../compact_formatter.js";
import type { local_variable, stack_frame_info, source_location } from "../domain_types.js";

function make_var(name: string, value: string, type = "int", members: local_variable[] = []): local_variable {
    return { name, value, type, is_valid_value: true, members };
}

function make_frame(index: number, fn: string, file: string, line: number): stack_frame_info {
    return { index, function_name: fn, module: "mod", language: "C#", file_path: file, line };
}

describe("format_variables", () => {
    it("formats flat variables", () => {
        const vars = [make_var("x", "1"), make_var("y", "2")];
        const out = format_variables(vars, 0, 2);
        expect(out).toContain("x:int=1");
        expect(out).toContain("y:int=2");
    });

    it("formats nested variables", () => {
        const inner = make_var("child", "hello", "string");
        const outer = make_var("obj", "{}", "object", [inner]);
        const out = format_variables([outer], 0, 2);
        expect(out).toContain("obj:object={}");
        expect(out).toContain(".child:string=hello");
    });

    it("respects depth limiting", () => {
        const inner = make_var("child", "val", "string");
        const outer = make_var("obj", "{}", "object", [inner]);
        const out = format_variables([outer], 0, 0);
        expect(out).toContain("[+1]");
        expect(out).not.toContain(".child");
    });
});

describe("format_call_stack", () => {
    it("formats stack frames with file basenames", () => {
        const frames = [
            make_frame(0, "Main", "/src/app.cs", 10),
            make_frame(1, "Startup", "/src/startup.cs", 5),
        ];
        const out = format_call_stack(frames);
        expect(out).toContain("0: Main (app.cs:10)");
        expect(out).toContain("1: Startup (startup.cs:5)");
    });

    it("shows [ext] for frames without a file path", () => {
        const frames = [make_frame(0, "External", "", 0)];
        const out = format_call_stack(frames);
        expect(out).toContain("[ext]");
    });
});

describe("format_location", () => {
    it("formats a source location", () => {
        const loc: source_location = {
            file_path: "/src/app.cs",
            line: 42,
            column: 5,
            function_name: "DoWork",
            project_name: "MyProj",
        };
        const out = format_location(loc);
        expect(out).toBe("@ DoWork (app.cs:42) [MyProj]");
    });
});

describe("format_variable_diff", () => {
    it("detects changed variables", () => {
        const prev = [make_var("x", "1")];
        const curr = [make_var("x", "2")];
        const out = format_variable_diff(prev, curr, 2);
        expect(out).toContain("[changed]");
        expect(out).toContain("was 1");
    });

    it("detects new variables", () => {
        const prev: local_variable[] = [];
        const curr = [make_var("y", "5")];
        const out = format_variable_diff(prev, curr, 2);
        expect(out).toContain("[new]");
        expect(out).toContain("y:int=5");
    });

    it("detects removed variables", () => {
        const prev = [make_var("z", "3")];
        const curr: local_variable[] = [];
        const out = format_variable_diff(prev, curr, 2);
        expect(out).toContain("[removed]");
        expect(out).toContain("z:int");
    });
});

describe("format_call_stack_diff", () => {
    it("returns unchanged marker for equal stacks", () => {
        const frames = [make_frame(0, "Main", "/src/app.cs", 10)];
        const out = format_call_stack_diff(frames, frames);
        expect(out).toBe("[stack unchanged]");
    });

    it("returns new stack when frames differ", () => {
        const a = [make_frame(0, "Main", "/src/app.cs", 10)];
        const b = [make_frame(0, "Main", "/src/app.cs", 20)];
        const out = format_call_stack_diff(a, b);
        expect(out).toContain("[stack]");
        expect(out).toContain("app.cs:20");
    });
});

describe("format_variable_change_summary", () => {
    it("summarises changed, new, and removed vars", () => {
        const prev = [make_var("a", "1"), make_var("b", "2")];
        const curr = [make_var("a", "9"), make_var("c", "3")];
        const out = format_variable_change_summary(prev, curr);
        expect(out).toContain("changed: a");
        expect(out).toContain("new: c");
        expect(out).toContain("removed: b");
    });

    it("returns no-changes marker when variables are identical", () => {
        const vars = [make_var("x", "1")];
        expect(format_variable_change_summary(vars, vars)).toBe("[no changes]");
    });
});
