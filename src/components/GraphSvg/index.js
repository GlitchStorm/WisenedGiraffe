import React, {Component} from 'react';
import {svgKeyDown, svgKeyUp} from './keyboardEvents';
import {deselect_path_and_nodes, initSimulation, updateGraph, zoom_actions, analyzeGraph} from './graphActions';
import {appendMarkerAttributes} from './markerActions';

import * as d3 from 'd3';
import {add_node} from './nodeActions';
import {parse, stringify} from 'flatted/esm';
import pako from 'pako';
import Base64 from 'Base64';

const styles = theme => ({
  tooltip: {
    position: 'absolute',
    textAlign: 'center',
    padding: 2,
    font: '12px sans-serif',
    background: 'lightsteelblue',
    border: 0,
    borderRadius: 8,
    pointerEvents: 'none',
    zIndex: 1202
  }
});

class GraphSvg extends Component {
  constructor(props) {
    super(props);
    this.state = {};
  }

  addNode(nodeData) {
    add_node(nodeData, this);

    console.log(JSON.stringify(nodeData));
  }

  resetCamera() {
    this.inputSvg.transition()
      .duration(750)
      .call(this.zoom_handler.transform, d3.zoomIdentity);

    this.updateGraphHelper();
  }

  jiggle() {
    this.graphData.nodes.forEach(node => {
      node.x = 0;
      node.y = 0;
    });

    this.updateGraphHelper();
  }

  fixNodes() {
    this.graphData.nodes.forEach(node => {
      node.fx = node.x;
      node.fy = node.y;
    });

    this.updateGraphHelper();
  }

  unfixNodes() {
    this.graphData.nodes.forEach(node => {
      node.fx = null;
      node.fy = null;
      node.vx = 0;
      node.vy  = 0;
    });

    this.updateGraphHelper();
  }

  createGraph(inputSvg, nodes = [], links = [], data = {}) {
    this.graphData = {
      nodes: nodes,
      links: links
    };

    this.id = Math.max(...(this.graphData.nodes.map(elem => elem.id))) + 1;
    if (this.id === Number.NEGATIVE_INFINITY) {
      this.id = 0;
    }
    this.inputSvg = inputSvg;

    //add encompassing group for the zoom
    this.svgGroup = inputSvg.append('g')
      .attr('class', 'objects')
      .attr('id', 'svgGroup');

    const graphObjects = this.svgGroup;

    const t = this;

    inputSvg.on('click', function (d) {
      deselect_path_and_nodes.call(this, t);
    });

    d3.select(window).on('keydown', function (d) {
      svgKeyDown.call(this, d, t);
    }).on('keyup', function (d) {
      svgKeyUp.call(this, d, t);
    });

    //add zoom capabilities
    this.zoom_handler = d3.zoom()
      .on('zoom', () => zoom_actions(graphObjects))
      .scaleExtent([0.1, 6]);
    this.zoom_handler(inputSvg);
    inputSvg.on('dblclick.zoom', null);

    //Create definitions for the arrow markers showing relationship directions
    const defs = graphObjects.append('defs');
    appendMarkerAttributes(defs.append('svg:marker')
      .attr('id', 'default-path-arrow')
      .attr('refX', 35));

    appendMarkerAttributes(defs.append('svg:marker')
      .attr('id', 'highlight-path-arrow-orange')
      .attr('fill', 'orange')
      .attr('refX', 24));

    appendMarkerAttributes(defs.append('svg:marker')
      .attr('id', 'dragged-end-arrow')
      .attr('refX', 7));

    const filter = defs.append('filter')
      .attr('id', 'drop-shadow')
      .attr('height', '130%')
      .attr('width', '130%')
      .attr('filterUnits', 'userSpaceOnUse');

    filter.append('feGaussianBlur')
      .attr('in', 'SourceAlpha')
      .attr('stdDeviation', 5)
      .attr('result', 'blur');

    filter.append('feOffset')
      .attr('in', 'blur')
      .attr('result', 'offsetBlur');

    filter.append('feFlood')
      .attr('in', 'offsetBlur')
      .attr('flood-color','white')
      .attr('flood-opacity', '1')
      .attr('result', 'offsetColor');

    filter.append('feComposite')
      .attr('in', 'offsetColor')
      .attr('in2', 'offsetBlur')
      .attr('operator', 'in')
      .attr('result', 'offsetBlur');

    const feMerge = filter.append('feMerge');

    feMerge.append('feMergeNode')
      .attr('in', 'offsetBlur');
    feMerge.append('feMergeNode')
      .attr('in', 'SourceGraphic');


    //The dragged line
    this.dragLine = graphObjects.append('g').append('svg:path')
      .attr('class', 'link dragline line-object hidden')
      .attr('d', 'M0,0L0,0')
      .attr('stroke', function (d) {
        return d3.color('#000000');
      })
      .style('marker-end', 'url(#dragged-end-arrow)');

    const graphLinksGroup = graphObjects.append('g') //graphLinksData
      .attr('class', 'links-g-group');

    const graphNodesGroup = graphObjects
      .append('g')
      .attr('class', 'nodes-g-group');

    let simulation = initSimulation();

    this.graphNodesGroup = graphNodesGroup;
    this.graphLinksGroup = graphLinksGroup;
    this.simulation = simulation;
    this.updateGraphHelper();
  }

  updateGraphHelper() {
    updateGraph.call(this, this.simulation, this.graphNodesGroup, this.graphLinksGroup);
  }

  clearGraphDataRaw() {
    const parent = d3.select(d3.select('#mainRender').node().parentElement);
    d3.select('#mainRender').selectAll('*').remove();
    d3.select('#mainRender').remove();

    return parent.append('svg').attr('id', 'mainRender');
  }

  clearGraphData(t) {
    deselect_path_and_nodes.call(this, t);
    const svg = this.clearGraphDataRaw();
    this.createGraph(svg);
  }

  loadGraphData(data) {
    const svg = this.clearGraphDataRaw();
    //nodes, links, data
    this.createGraph(svg, data.graphData.nodes, data.graphData.links);
  }

  compressGraphData() {
    const compressedData = {
      version: 0.01,
      graphData: this.graphData,
      playerData: {},
      secret: {}
    };
    return Base64.btoa(pako.deflate(stringify(compressedData), { to: 'string' }));
  }

  inflateGraphData(data) {
    return parse(pako.inflate(Base64.atob(data),  { to: 'string' }));
  }

  analyze = () =>  {
    analyzeGraph.call(this);
    this.updateGraphHelper();
  };

  componentDidMount() {
    // const data = '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';
    const data = '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';
    // const data = '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';
    // const data = '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';
    // const data = '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';
    this.loadGraphData(this.inflateGraphData(data));
    this.analyze();
  }
  componentDidUpdate(prevProps, prevState, snapshot) {
    if (this.state.selectedPath !== prevState.selectedPath || this.state.selectedNode !== prevState.selectedNode) {
      this.props.parentAccessor.setState({selectedPath: this.state.selectedPath, selectedNode: this.state.selectedNode});
    }
  }


  render() {
    return <svg id="mainRender"/>;
  }
}

export default GraphSvg;