let map
let datasetLayer

const mapId = '33d6428f2a3923ea'
const datasetId = '11e3d934-7cb3-42ed-87d9-95cb1034ce20'

const boundsOfNYC = {
  north: 41.20,
  south: 40.40309,
  west: -74.47253,
  east: -73.56091
}

let selectedPropertyBBL = null
let zoomLevelAtWhichStylesMostRecentlyApplied = null

// Determine the map's starting position and zoom level from the URL's hash, or fallback to a default location and zoom level
function getMapParametersFromHash () {
  const defaults = {
    lat: 40.76882764497733,
    lng: -73.96813178859476,
    zoom: 16,
    selectedPropertyBBL: null
  }

  const hash = window.location.hash
  if (hash.startsWith('#!')) {
    const params = {}
    const regExp = /[\#|&]([^=]+)=([^&]+)/g
    let match

    while ((match = regExp.exec(hash)) !== null) {
      params[match[1]] = parseFloat(match[2])
    }

    return {
      lat: params.lat || defaults.lat,
      lng: params.lng || defaults.lng,
      zoom: params.zoom || defaults.zoom
    }
  }

  return defaults
}

async function initMap () {
  const { Map } = await window.google.maps.importLibrary('maps')

  const mapParameters = getMapParametersFromHash()

  // Create the map
  map = new Map(document.getElementById('map'), {
    center: {
      lat: mapParameters.lat,
      lng: mapParameters.lng
    },
    zoom: mapParameters.zoom,
    minZoom: 13,
    restriction: {
      latLngBounds: boundsOfNYC,
      strictBounds: false
    },
    mapId,
    greedy: 'greedy',
    streetViewControl: false,
    mapTypeControl: false,
    fullscreenControl: false
  })

  // Attach the property tax dataset to the map
  datasetLayer = map.getDatasetFeatureLayer(datasetId)

  // Determine the style of each point in the dataset using the setOnMapPropertyStyle function
  datasetLayer.style = setOnMapPropertyStyle

  // Register the function to update the pane showing property details upon clicking on a property on the map
  datasetLayer.addListener('click', handlePropertyClickOnMap)

  map.addListener('click', handleClickOnMap)

  // Register the function to update the URL hash upon adjusting the map position or zoom
  map.addListener('idle', updateUrlHash)

  // Register the function to recompute property styles when the zoom level changes
  map.addListener('zoom_changed', handleZoomChanged)

  // Attach the map legend
  const legend = document.getElementById('legend')
  map.controls[window.google.maps.ControlPosition.BOTTOM_CENTER].push(legend)

  document.getElementById('legend').classList.add('animate-fade-in')

  // Initialize the current zoom level
  currentZoomLevel = map.getZoom()
}

const updateUrlHash = function () {
// Get the map position
  const center = map.getCenter()
  const zoom = map.getZoom()

  let bblHashComponent = ''
  if (selectedPropertyBBL !== null) {
    bblHashComponent = `&bbl=${selectedPropertyBBL}`
  }
  // Update the URL hash with the new center
  window.location.hash = `#!lat=${center.lat()}&lng=${center.lng()}&zoom=${zoom}` + bblHashComponent
}

// When the zoom level changes significantly, re-compute the property styles so that we can resize the property bubbles to be larger at deeper zoom levels
const zoomLevelDeltaAtWhichToUpdateStyles = 0.5
let currentZoomLevel = null
const handleZoomChanged = function (e) {
  currentZoomLevel = map.getZoom()

  // Only update styles when the zoom has changed by more than zoomLevelDeltaAtWhichToUpdateStyles since the styles were most recently updated
  if (currentZoomLevel > zoomLevelAtWhichStylesMostRecentlyApplied + zoomLevelDeltaAtWhichToUpdateStyles || currentZoomLevel < zoomLevelAtWhichStylesMostRecentlyApplied - zoomLevelDeltaAtWhichToUpdateStyles) {
    // Update the tracker of the zoom level at which the styles were most recently updated
    zoomLevelAtWhichStylesMostRecentlyApplied = currentZoomLevel
    datasetLayer.style = setOnMapPropertyStyle
  }
}

const handleClickOnMap = function (e) {
  selectedPropertyBBL = null
  const propertyDetailsDrawerHTML = ''
  document.getElementById('nav-home-tab').click()
  document.getElementById('property-details-drawer').innerHTML = propertyDetailsDrawerHTML
  updateUrlHash()
}

const departmentOfFinanceUrlTemplate = 'https://a836-pts-access.nyc.gov/care/datalets/datalet.aspx?mode=profileall2&UseSearch=no&pin='
const zolaTemplate = 'https://zola.planning.nyc.gov/l/lot/'
const taxClassDescriptions = {
  1: 'Residential with up to three units',
  2: 'Residential with four or more units',
  3: 'Utilities',
  4: 'Commercial or industrial'
}
const handlePropertyClickOnMap = function (e) {
  if (e.features) {
    const clickedPropertyAttributes = e.features[0].datasetAttributes
    console.log(clickedPropertyAttributes)

    selectedPropertyBBL = clickedPropertyAttributes.BoroughBlockLot

    const effectiveTaxRatePercentileWithinClass = findTaxRatePercentile(clickedPropertyAttributes.TaxClass, clickedPropertyAttributes.EffectiveTaxRate, effectiveTaxRateQuantiles)
    console.log(effectiveTaxRatePercentileWithinClass)

    const propertyDetailsAttributeNameClass = 'col-5 my-1 my-md-2 lh-1'
    const propertyDetailsAttributeValueClass = 'col-7 my-1 my-md-2 lh-1'
    const propertyDetailsDrawerHTML = `
    <dl class="row small"><dt class="${propertyDetailsAttributeNameClass}">Address</dt>
    <dd class="${propertyDetailsAttributeValueClass}">${clickedPropertyAttributes.Address}</dd>
    
    <dt class="${propertyDetailsAttributeNameClass}">Owner</dt>
    <dd class="${propertyDetailsAttributeValueClass}">${clickedPropertyAttributes.OwnerName}</dd>

    <dt class="${propertyDetailsAttributeNameClass}">Tax Class</dt>
    <dd class="${propertyDetailsAttributeValueClass}">${taxClassDescriptions[clickedPropertyAttributes.TaxClass]} <span class="text-muted">(Class&nbsp;${clickedPropertyAttributes.TaxClass})</span></dd>
  
    <dt class="${propertyDetailsAttributeNameClass}">Market Value</dt>
    <dd class="${propertyDetailsAttributeValueClass}">${formatCurrency(clickedPropertyAttributes.CurrentMarketTotalValue)}</dd>

    <dt class="${propertyDetailsAttributeNameClass}">Property Tax&nbsp;Bill</dt>
    <dd class="${propertyDetailsAttributeValueClass}">${formatCurrency(clickedPropertyAttributes.TaxBill)} <span class="text-muted">per year</span></dd>

    <dt class="${propertyDetailsAttributeNameClass}">Effective Tax Rate</dt>
    <dd class="${propertyDetailsAttributeValueClass}"><span style="color: ${determineColorForEffectiveTaxRate(clickedPropertyAttributes.EffectiveTaxRate)};">${formatPercentage(clickedPropertyAttributes.EffectiveTaxRate)}</span> <span class="text-muted">of the property's value per year</span></dd>

    <dt class="${propertyDetailsAttributeNameClass}">Tax Rate Comparison</dt>
    <dd class="${propertyDetailsAttributeValueClass}">This property's tax rate is <span style="color: ${effectiveTaxRatePercentileWithinClass.color};">${effectiveTaxRatePercentileWithinClass.comparitor} than ${Math.round(effectiveTaxRatePercentileWithinClass.comparitorPercentile)}%</span> of taxable NYC class&nbsp;${clickedPropertyAttributes.TaxClass} properties</dd>

    <dd class="col">View property on: <a href="${departmentOfFinanceUrlTemplate}${clickedPropertyAttributes.BoroughBlockLot}" target="_blank">Department of Finance</a>, <a href="${zolaTemplate}${[clickedPropertyAttributes.BoroughBlockLot.substring(0, 1), clickedPropertyAttributes.BoroughBlockLot.substring(1, 6), clickedPropertyAttributes.BoroughBlockLot.substring(6)].join('/')}">Zoning & Land Use map</a></dd>
      </dl>
      `

    document.getElementById('property-details-drawer').innerHTML = propertyDetailsDrawerHTML
    document.getElementById('nav-property-details-tab').click()

    updateUrlHash()
  }
}

const isTouchscreen = 'ontouchstart' in window || navigator.maxTouchPoints > 0 || navigator.msMaxTouchPoints > 0
function setOnMapPropertyStyle (params) {
  // Determine the right color for this property, based on its effective tax rate
  const thisPropertyColor = determineColorForEffectiveTaxRate(params.feature.datasetAttributes.EffectiveTaxRate)

  // Determine pointRadius based on zoom level
  // const zoomLevel = map.getZoom()
  let pointRadius = 1
  if (currentZoomLevel <= 15.5) {
    pointRadius = 0.5
  } else if (currentZoomLevel <= 16) {
    pointRadius = 1
  } else if (currentZoomLevel <= 17) {
    pointRadius = 1.5
  } else if (currentZoomLevel <= 18) {
    pointRadius = 3
  } else if (currentZoomLevel <= 18.5) {
    pointRadius = 5
  } else if (currentZoomLevel <= 19) {
    pointRadius = 10
  } else {
    pointRadius = 15
  }
  // if (isTouchscreen) { pointRadius = pointRadius * 2 }

  return {
    strokeColor: thisPropertyColor,
    strokeWeight: 2,
    strokeOpacity: 1,
    fillColor: thisPropertyColor,
    fillOpacity: 0.3,
    pointRadius
  }
}

// Color scale from https://purple.vercel.app/#4/6/50/37/-65/108/20/14/E3A100/227/161/0
const effectiveTaxRateToColorMap = [
  [0, '#000000'],
  [0.003, '#137900'],
  [0.007, '#449500'],
  [0.010, '#83B000'],
  [0.015, '#CAC600'],
  [0.025, '#E3A100'],
  [0.035, '#E86610'],
  [0.045, '#ED3020'],
  [1.000, '#F12F4D']
]
const effectiveTopEndOfScale = 0.06
const determineColorForEffectiveTaxRate = function (effectiveTaxRate) {
  if (isNaN(effectiveTaxRate)) {
    return effectiveTaxRateToColorMap[0][1]
  }

  for (let index = 0; index < effectiveTaxRateToColorMap.length; index++) {
    const element = effectiveTaxRateToColorMap[index]
    if (effectiveTaxRate <= element[0]) {
      return element[1]
    }
  }

  return effectiveTaxRateToColorMap[0][1]
}

// Calculate and set a linear gradiaent representing the color scale for the map
const calculateLinearGradientForColorScale = function () {
  function createGradient (colorsMap, rangeMax) {
    const gradientStops = colorsMap.map(([position, color]) => {
      const percentage = Math.min((position / rangeMax) * 100, 100)
      return `${color} ${percentage.toFixed(2)}%`
    })

    return `linear-gradient(90deg, ${gradientStops.join(', ')})`
  }

  const cssGradient = createGradient(effectiveTaxRateToColorMap, effectiveTopEndOfScale)
  console.log(cssGradient)
  const element = document.getElementById('color-scale')
  element.style.background = cssGradient
}
calculateLinearGradientForColorScale()

// Create the map
initMap()

// Format a currency string without decimal places
const formatCurrency = function (value) {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    minimumFractionDigits: 0, // No decimal places
    maximumFractionDigits: 0 // No decimal places
  }).format(value)
}

// Format a percentage string with two deximal places
function formatPercentage (value) {
  if (isNaN(value)) {
    return '0.0%'
  }

  return new Intl.NumberFormat('en-US', {
    style: 'percent',
    maximumFractionDigits: 2 // Two decimal places
  }).format(value)
}

const effectiveTaxRateQuantiles = [{
  TaxClass: '1',
  EffectiveTaxRatePercentiles: ['2e-08', '0.00138333', '0.00184305', '0.0021257', '0.00235697', '0.00254749', '0.00273613', '0.00291592', '0.00308837', '0.00324847', '0.00342775', '0.00359704', '0.00378198', '0.00395863', '0.00414968', '0.00434414', '0.00452924', '0.00470591', '0.00488228', '0.00504664', '0.00519877', '0.00535087', '0.00548319', '0.00561207', '0.00573121', '0.00584332', '0.00595229', '0.00604547', '0.00614035', '0.00622529', '0.00631132', '0.00639156', '0.00646836', '0.00654069', '0.00661323', '0.00668065', '0.0067463', '0.00680929', '0.00687158', '0.00693246', '0.00699005', '0.00704675', '0.0071033', '0.00715825', '0.00720829', '0.00726341', '0.00731245', '0.00736385', '0.00741583', '0.00746577', '0.00751299', '0.00756261', '0.00761106', '0.00766011', '0.00770772', '0.00775589', '0.00780128', '0.00784775', '0.00789433', '0.00794279', '0.00798637', '0.0080334', '0.00807909', '0.00812679', '0.0081747', '0.00822129', '0.00826887', '0.0083151', '0.00836243', '0.00841525', '0.00846261', '0.00851372', '0.00856309', '0.00861359', '0.0086636', '0.0087177', '0.00877205', '0.00882852', '0.00888507', '0.00894602', '0.00900668', '0.00906797', '0.00913239', '0.00919789', '0.00926594', '0.00933816', '0.00941295', '0.00949085', '0.00957376', '0.00966397', '0.00976147', '0.00986932', '0.00998453', '0.01011264', '0.01025793', '0.01043208', '0.01061794', '0.01086666', '0.01126248', '0.01194501', '0.01910029']
}, {
  TaxClass: '2',
  EffectiveTaxRatePercentiles: ['2e-08', '0.00036655', '0.00111448', '0.00199877', '0.00291851', '0.00383745', '0.00458391', '0.00518532', '0.00575024', '0.00623384', '0.00668227', '0.0071111', '0.00753794', '0.00793266', '0.00834377', '0.00873793', '0.00917241', '0.00962425', '0.0100763', '0.01052399', '0.01097354', '0.01139557', '0.011852', '0.01231705', '0.01277505', '0.0132571', '0.01373064', '0.01417081', '0.01459538', '0.01505802', '0.01551336', '0.01594749', '0.01636658', '0.01675762', '0.01717235', '0.0175789', '0.01798287', '0.01838131', '0.01880798', '0.01920181', '0.01960195', '0.01996274', '0.02024362', '0.02065136', '0.02105791', '0.02149899', '0.02190859', '0.02233084', '0.02275524', '0.0232323', '0.0236871', '0.02422911', '0.02479859', '0.02540618', '0.0260342', '0.02664137', '0.02735747', '0.02817449', '0.02859605', '0.02961561', '0.0307974', '0.03192778', '0.03299376', '0.03419789', '0.03555184', '0.03684403', '0.03819776', '0.03940191', '0.04071769', '0.04184728', '0.0428881', '0.04380644', '0.04465432', '0.0454092', '0.04611842', '0.04678923', '0.0474489', '0.04804757', '0.0486823', '0.04932764', '0.04981792', '0.05039171', '0.05097261', '0.05152717', '0.05205821', '0.05259107', '0.05309245', '0.0536354', '0.05415089', '0.05465902', '0.05517866', '0.055215', '0.055215', '0.055215', '0.055215', '0.055215', '0.055215', '0.055215', '0.055215', '0.055215', '0.05521584']
}, {
  TaxClass: '3',
  EffectiveTaxRatePercentiles: ['0.05749011', '0.05749011', '0.05749011', '0.05749011', '0.05749011', '0.05749011', '0.05749011', '0.05749011', '0.05749011', '0.05749011', '0.05749011', '0.05749011', '0.05749011', '0.05749011', '0.05749011', '0.05749011', '0.05749011', '0.05749011', '0.05749011', '0.05749011', '0.05749011', '0.05749011', '0.05749011', '0.05749011', '0.05749011', '0.05749011', '0.05749011', '0.05749011', '0.05749011', '0.05749011', '0.05749011', '0.05749011', '0.05749011', '0.05749011', '0.05749011', '0.05749011', '0.05749011', '0.05749011', '0.05749011', '0.05749011', '0.05749011', '0.05749011', '0.05749011', '0.05749011', '0.05749011', '0.05749011', '0.05749011', '0.05749011', '0.05749011', '0.05749011', '0.05749011', '0.05749011', '0.05749011', '0.05749011', '0.05749011', '0.05749011', '0.05749011', '0.05749011', '0.05749011', '0.05749011', '0.05749011', '0.05749011', '0.05749011', '0.05749011', '0.05749011', '0.05749011', '0.05749011', '0.05749011', '0.05749011', '0.05749011', '0.05749011', '0.05749011', '0.05749011', '0.05749011', '0.05749011', '0.05749011', '0.05749011', '0.05749011', '0.05749011', '0.05749011', '0.05749011', '0.05749011', '0.05749011', '0.05749011', '0.05749011', '0.05749011', '0.05749011', '0.05749011', '0.05749011', '0.05749011', '0.05749011', '0.05749011', '0.05749011', '0.05749011', '0.05749011', '0.05749011', '0.05749011', '0.05749011', '0.05749011', '0.05749011', '0.05749011']
}, {
  TaxClass: '4',
  EffectiveTaxRatePercentiles: ['1e-08', '0.00484925', '0.00920487', '0.01270785', '0.01659504', '0.02073678', '0.02481503', '0.02880022', '0.03144592', '0.03324006', '0.03377071', '0.03380114', '0.03408295', '0.03491499', '0.0357925', '0.03657987', '0.03734738', '0.03803863', '0.0386581', '0.03915041', '0.03960594', '0.04008727', '0.04044635', '0.04080438', '0.04112864', '0.04142438', '0.04166847', '0.04192672', '0.04216059', '0.04236413', '0.04256026', '0.04270885', '0.04287026', '0.04304121', '0.04317508', '0.04328435', '0.04344336', '0.04360847', '0.04377869', '0.04394299', '0.04410607', '0.04425415', '0.04442703', '0.04457786', '0.04472693', '0.04486712', '0.04499328', '0.04507268', '0.04518596', '0.04531214', '0.04544724', '0.04557867', '0.04570822', '0.04584516', '0.04597657', '0.04609416', '0.04622584', '0.04636361', '0.04649306', '0.04664129', '0.04678255', '0.04690426', '0.04698613', '0.04703393', '0.04704767', '0.04708631', '0.04720179', '0.04735198', '0.04750368', '0.04765875', '0.04781766', '0.047925', '0.047925', '0.047925', '0.047925', '0.047925', '0.047925', '0.047925', '0.047925', '0.047925', '0.047925', '0.047925', '0.047925', '0.047925', '0.047925', '0.047925', '0.047925', '0.047925', '0.047925', '0.047925', '0.047925', '0.047925', '0.047925', '0.047925', '0.047925', '0.047925', '0.047925', '0.047925', '0.047925', '0.047925', '0.0550906']
}]

function findTaxRatePercentile (taxClass, effectiveTaxRate, effectiveTaxRateQuantiles) {
  // Find the tax class entry
  const taxClassEntry = effectiveTaxRateQuantiles.find(entry => entry.TaxClass === taxClass)

  if (!taxClassEntry) {
    return 'Tax class not found'
  }

  // Convert percentile strings to floats
  const percentiles = taxClassEntry.EffectiveTaxRatePercentiles.map(rate => parseFloat(rate))

  // Find the position of the effective tax rate in the percentiles array
  let position = percentiles.findIndex(rate => effectiveTaxRate <= rate)

  // Adjust position if it's not found (meaning it's higher than the last percentile)
  if (position === -1) {
    position = percentiles.length
  }

  // Calculate and return the percentile
  const percentile = position / percentiles.length * 100

  if (percentile < 50) {
    return {
      percentile,
      comparitor: 'lower',
      comparitorPercentile: 100 - percentile,
      color: '#137900'
    }
  } else {
    return {
      percentile,
      comparitor: 'higher',
      comparitorPercentile: percentile,
      color: '#F12F4D'
    }
  }
}
