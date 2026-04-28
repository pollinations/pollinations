export class DurableObject {
    constructor(
        protected readonly ctx: DurableObjectState,
        protected readonly env: CloudflareBindings,
    ) {}
}
