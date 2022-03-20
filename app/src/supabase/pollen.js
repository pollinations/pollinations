import supabase from "./client.js";

export function getAllPollens() {
    return supabase.from("baseapp_pollen").select("*").order("id", {ascending: false}).then(response => {
        return response.data
    })
}

export function createPollen(search_text, inputs, outputs, model_name, cid, ipns) {
    return supabase.from("baseapp_pollen").insert([{
        "search_text": search_text,
        "inputs": inputs,
        "outputs": outputs,
        "model_name": model_name,
        "cid": cid,
        "ipns": ipns,
        "created": new Date(),
        "modified": new Date()
    }]).then(response => {
        return response.data
    })
}

export function updatePollen(id, search_text, inputs, outputs, model_name, cid, ipns) {
    return supabase.from("baseapp_pollen").update([{
        "id": id,
        "search_text": search_text,
        "inputs": inputs,
        "outputs": outputs,
        "model_name": model_name,
        "cid": cid,
        "ipns": ipns,
        "modified": new Date()
    }]).match({"id": id}).then(response => {
        return response.data
    })
}

export function deletePollen(id) {
    return supabase.from("baseapp_pollen").delete().match({"id": id}).then(response => {
        return response.data
    })
}