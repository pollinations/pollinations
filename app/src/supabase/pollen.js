import supabase from './client.js';

export function getAllPollens() {
  return supabase.from('baseapp_pollen').select('*').order('id', { ascending: false }).then((response) => response.data);
}

export function createPollen(search_text, inputs, outputs, model_name, cid, ipns) {
  return supabase.from('baseapp_pollen').insert([{
    search_text,
    inputs,
    outputs,
    model_name,
    cid,
    ipns,
    created: new Date(),
    modified: new Date(),
  }]).then((response) => response.data);
}

export function updatePollen(id, search_text, inputs, outputs, model_name, cid, ipns) {
  return supabase.from('baseapp_pollen').update([{
    id,
    search_text,
    inputs,
    outputs,
    model_name,
    cid,
    ipns,
    modified: new Date(),
  }]).match({ id }).then((response) => response.data);
}

export function deletePollen(id) {
  return supabase.from('baseapp_pollen').delete().match({ id }).then((response) => response.data);
}
