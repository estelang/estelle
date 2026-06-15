declare module "luamin" {
	function minify(code: string): string;
	const luamin: { readonly minify: typeof minify };
	export default luamin;
}
