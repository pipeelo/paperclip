const KB_AREAS = '00000000-0000-4000-8000-00000000000a';
const P = String(environments.PIPEELO_API_URL || 'https://api.pipeelo.com').replace(/\/+$/, '');
const lerAreas = async () => {
    const r = await axios.get(`${P}/v1/knowledge-base/${KB_AREAS}`, { headers: { Authorization: `Bearer ${environments.PIPEELO_API_TOKEN}` }, validateStatus: () => true, timeout: 10000 });
    if (r.status !== 200) throw new Error(`areas: HTTP ${r.status}`);
    return JSON.parse(r.data.data.context);
};
const erp = (path, body) => axios.post(`${environments.ERP_URL}${path}`, body, { headers: { Authorization: `Bearer ${environments.ERP_TOKEN}` }, validateStatus: () => true });
return (async () => {
    let areas;
    try { areas = await lerAreas(); } catch (e) { return 'ERRO_TABELA_AREAS: transfira para o setor humano.'; }
    const { cidade, bairro, data } = params || {};
    const area = areas.agendas.find(a => a.cidade === cidade && a.bairros.includes(bairro));
    if (!area) return 'FORA_DA_AREA: siga o fluxo padrão.';
    const r = await erp('/ordens/visita-suporte', { agenda: area.id, data });
    return r.status === 200 ? `OK: visita agendada para ${data}.` : 'ERRO_ERP: siga o fluxo padrão.';
})();
