// Connections map on /commentary/ (layouts/commentary/list.html), drawn with d3-force.
// Notes and the pages they connect are dots; drag to move, scroll or pinch to zoom, click to open.
(() => {
  const holder = document.getElementById('commentary-graph');
  const data = document.getElementById('commentary-graph-data');
  if (!holder || !data || !window.d3) return;
  const { nodes, edges } = JSON.parse(data.textContent);
  const links = (edges || []).map(edge => ({ ...edge }));
  const { clientWidth: width, clientHeight: height } = holder;

  const svg = d3.select(holder).append('svg').attr('viewBox', [-width / 2, -height / 2, width, height]);
  const layer = svg.append('g');
  svg.call(d3.zoom().scaleExtent([0.2, 4]).on('zoom', event => layer.attr('transform', event.transform)));

  const link = layer.append('g').attr('class', 'graph-links').selectAll('line').data(links).join('line');
  const node = layer.append('g').selectAll('g').data(nodes).join('g')
    .attr('class', d => `graph-node graph-${d.kind}`)
    .on('click', (event, d) => { if (!event.defaultPrevented) location.href = d.id; });
  node.append('circle').attr('r', d => (d.kind === 'note' ? 8 : 6));
  node.append('text').attr('x', 12).attr('dy', '.35em').text(d => d.label);
  node.append('title').text(d => d.label);

  const simulation = d3.forceSimulation(nodes)
    .force('link', d3.forceLink(links).id(d => d.id).distance(90))
    .force('charge', d3.forceManyBody().strength(-260))
    .force('x', d3.forceX())
    .force('y', d3.forceY())
    .on('tick', () => {
      link.attr('x1', d => d.source.x).attr('y1', d => d.source.y).attr('x2', d => d.target.x).attr('y2', d => d.target.y);
      node.attr('transform', d => `translate(${d.x},${d.y})`);
    });

  node.call(d3.drag()
    .on('start', (event, d) => { if (!event.active) simulation.alphaTarget(0.3).restart(); d.fx = d.x; d.fy = d.y; })
    .on('drag', (event, d) => { d.fx = event.x; d.fy = event.y; })
    .on('end', (event, d) => { if (!event.active) simulation.alphaTarget(0); d.fx = null; d.fy = null; }));
})();
