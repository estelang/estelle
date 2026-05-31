import "./style.css";
import { transpile } from "./compiler/index.ts";

const defaultEstelle = String.raw`fnc main {
    name = arg("name", "World")
    output "Hello, {name}!"
}`;

document.querySelector<HTMLDivElement>("#app")!.innerHTML = `
  <main class="playground">
    <header class="toolbar">
      <h1>Estelle → Lua</h1>
      <button type="button" id="transpile-run">Transpile</button>
    </header>
    <div class="panes">
      <section class="pane">
        <label for="estelle-in">Estelle</label>
        <textarea id="estelle-in" spellcheck="false" class="editor"></textarea>
      </section>
      <section class="pane">
        <label for="lua-out">Lua</label>
        <textarea id="lua-out" spellcheck="false" class="editor" readonly aria-readonly="true"></textarea>
      </section>
    </div>
    <section class="diag" aria-live="polite">
      <h2>Diagnostics</h2>
      <ul id="diag-list" class="diag-list"></ul>
    </section>
  </main>
`;

const input = document.querySelector<HTMLTextAreaElement>("#estelle-in")!;
const output = document.querySelector<HTMLTextAreaElement>("#lua-out")!;
const diagList = document.querySelector<HTMLUListElement>("#diag-list")!;
const run = document.querySelector<HTMLButtonElement>("#transpile-run")!;

input.value = defaultEstelle;

function render(result: ReturnType<typeof transpile>): void {
	diagList.replaceChildren();

	for (const d of result.diagnostics) {
		const li = document.createElement("li");
		li.className = `diag-${d.severity}`;
		li.textContent =
			d.message +
			(d.span !== undefined ? ` @ ${d.span.start}–${d.span.end}` : "");
		diagList.append(li);
	}

	output.value = result.lua ?? "";
}

run.addEventListener("click", () => {
	render(transpile(input.value));
});

render(transpile(defaultEstelle));
