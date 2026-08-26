const TINYBIRD_API = "https://api.europe-west2.gcp.tinybird.co";
const PRIVATE_CONFIG_PIPE = "economics_private_config_api";
const RECONCILIATION_FIELDS = [
    "providerCheckExplanations",
    "meterDriftExplanations",
    "pollenWitnessExplanations",
];

export async function loadPrivateReconciliation({
    token = process.env.TINYBIRD_ECONOMICS_READ_TOKEN,
    fetchImpl = fetch,
} = {}) {
    if (!token) {
        throw new Error("TINYBIRD_ECONOMICS_READ_TOKEN is required");
    }
    const response = await fetchImpl(
        `${TINYBIRD_API}/v0/pipes/${PRIVATE_CONFIG_PIPE}.json`,
        { headers: { Authorization: `Bearer ${token}` } },
    );
    if (!response.ok) {
        throw new Error(`${PRIVATE_CONFIG_PIPE}: HTTP ${response.status}`);
    }
    const body = await response.json();
    if (!Array.isArray(body.data) || body.data.length !== 1) {
        throw new Error(
            `${PRIVATE_CONFIG_PIPE}: expected one row, received ${body.data?.length ?? "invalid response"}`,
        );
    }

    let config;
    try {
        config = JSON.parse(body.data[0].config);
    } catch {
        throw new Error(`${PRIVATE_CONFIG_PIPE}: config is not valid JSON`);
    }
    const reconciliation = config?.reconciliation;
    if (
        reconciliation == null ||
        RECONCILIATION_FIELDS.some(
            (field) => !Array.isArray(reconciliation[field]),
        )
    ) {
        throw new Error(
            `${PRIVATE_CONFIG_PIPE}: reconciliation config is incomplete`,
        );
    }
    return reconciliation;
}
