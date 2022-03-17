import supabase from "./client.js";

export function getAllPollens() {
    return supabase.from("baseapp_pollen").select("*").order("id", {ascending: false}).then(response => {
        return response.data
    })
}

export function createPollen(input, cid, ipns) {
    return supabase.from("baseapp_pollen").insert([{
        "cid": cid,
        "ipns": ipns,
        "input": input,
        "created": new Date(),
        "modified": new Date()
    }]).then(response => {
        return response.data
    })
}

export function updatePollen(id, input, cid, ipns) {
    return supabase.from("baseapp_pollen").update([{
        "id": id,
        "cid": cid,
        "ipns": ipns,
        "input": input,
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