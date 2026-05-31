import { defineConfig } from "vitepress";

export default defineConfig({
	title: "Estelle",
	description:
		"A language for wiki editors. Write Scribunto modules without the complexity.",
	themeConfig: {
		nav: [
			{ text: "Home", link: "/" },
			{ text: "Quick Start", link: "/quickstart" },
			{ text: "Guide", link: "/guide/introduction" },
			{ text: "GitHub", link: "https://github.com/t7ru/estelle" },
		],

		sidebar: [
			{
				text: "Getting Started",
				items: [
					{ text: "Quick Start", link: "/quickstart" },
					{ text: "Introduction", link: "/guide/introduction" },
					{ text: "Language Basics", link: "/guide/basics" },
				],
			},
			{
				text: "Core Concepts",
				items: [
					{ text: "Functions", link: "/guide/functions" },
					{ text: "Output & Wikitext", link: "/guide/output" },
					{ text: "Control Flow", link: "/guide/control-flow" },
					{ text: "Tables", link: "/guide/tables" },
				],
			},
			{
				text: "Reference",
				items: [
					{ text: "Built-in Functions", link: "/guide/builtins" },
					{ text: "Lua Escape Hatch", link: "/guide/lua-escape" },
				],
			},
			{
				text: "Learning",
				items: [
					{ text: "Examples & Patterns", link: "/guide/examples" },
				],
			},
		],

		socialLinks: [
			{ icon: "github", link: "https://github.com/t7ru/estelle" },
		],
	},
});
