/**
 * DSI PROJECT - Indonesia Map Implementation using Leaflet
 */

document.addEventListener('DOMContentLoaded', () => {
    initMap();
});

function initMap() {
    // Focus on Indonesia
    const indonesiaCenter = [-2.5489, 118.0149];

    // Initialize Leaflet Map
    const map = L.map('map').setView(indonesiaCenter, 5);

    // Dark Mode Tile Layer (CartoDB Dark Matter)
    const darkTile = L.tileLayer('https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png', {
        attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors &copy; <a href="https://carto.com/attributions">CARTO</a>',
        subdomains: 'abcd',
        maxZoom: 20
    });

    // Light Mode Tile Layer (CartoDB Positron)
    const lightTile = L.tileLayer('https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png', {
        attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors &copy; <a href="https://carto.com/attributions">CARTO</a>',
        subdomains: 'abcd',
        maxZoom: 20
    });

    // Default to light or dark based on theme
    const isDark = document.documentElement.getAttribute('data-theme') === 'dark';
    if (isDark) {
        darkTile.addTo(map);
    } else {
        lightTile.addTo(map);
    }

    // Project Locations from User Reference Image
    const locations = [
        { name: "Jembatan Pulau Balang", lat: -1.1099436215087533, lng: 116.73125994381586, label: "Pulau Balang" },
        { name: "Jembatan Bentang Pendek Dup. I", lat: -1.1291427914750698, lng: 116.7227408361556 },
        { name: "Jakarta", lat: -6.2088, lng: 106.8456 },
        { name: "Jembatan Teluk Kendari", lat: -3.976167490696953, lng: 122.58705551082298, label: "Teluk Kendari", href: "/" },
        { name: "Surabaya", lat: -7.2575, lng: 112.7521, label: "Surabaya" },
        { name: "Pontianak", lat: -0.0263, lng: 109.3425 },
        { name: "Sampit", lat: -2.5361, lng: 112.9553, label: "CENTRAL KALIMANTAN" },
        { name: "Banjarmasin", lat: -3.3167, lng: 114.5901, label: "SOUTH KALIMANTAN" },
        { name: "Manado", lat: 1.4748, lng: 124.8421 },
        { name: "Ambon", lat: -3.6547, lng: 128.1906, label: "Teluk Ambon" },
        { name: "Timika", lat: -4.5468, lng: 136.8837, label: "CENTRAL PAPUA" }
    ];

    // Singapore (Special Blue Marker)
    const singapore = { name: "Singapore", lat: 1.3521, lng: 103.8198 };

    // Standard Icon configuration
    const RedIcon = L.Icon.extend({
        options: {
            iconUrl: 'https://raw.githubusercontent.com/pointhi/leaflet-color-markers/master/img/marker-icon-red.png',
            shadowUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/0.7.7/images/marker-shadow.png',
            iconSize: [25, 41],
            iconAnchor: [12, 41],
            popupAnchor: [1, -34],
            shadowSize: [41, 41]
        }
    });

    const BlueIcon = L.Icon.extend({
        options: {
            iconUrl: 'https://raw.githubusercontent.com/pointhi/leaflet-color-markers/master/img/marker-icon-blue.png',
            shadowUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/0.7.7/images/marker-shadow.png',
            iconSize: [25, 41],
            iconAnchor: [12, 41],
            popupAnchor: [1, -34],
            shadowSize: [41, 41]
        }
    });

    const redIcon = new RedIcon();
    const blueIcon = new BlueIcon();

    // Add normal markers
    locations.forEach(loc => {
        const marker = L.marker([loc.lat, loc.lng], { icon: redIcon }).addTo(map);
        marker.bindPopup(`<b>${loc.name}</b>${loc.label ? '<br>' + loc.label : ''}`);

        // Navigate on click if href is provided
        if (loc.href) {
            marker.on('click', () => {
                window.location.href = loc.href;
            });
        }

        // Always open tooltips as persistent labels if needed, or just popups
        if (loc.label) {
            marker.bindTooltip(loc.label, {
                permanent: true,
                direction: 'bottom',
                className: 'location-label'
            });
        }
    });

    // Add Singapore marker
    L.marker([singapore.lat, singapore.lng], { icon: blueIcon })
        .addTo(map)
        .bindPopup(`<b>${singapore.name}</b>`);

    // Handle Theme Changes
    const html = document.documentElement;
    const observer = new MutationObserver((mutations) => {
        mutations.forEach((mutation) => {
            if (mutation.attributeName === 'data-theme') {
                const isDarkNow = html.getAttribute('data-theme') === 'dark';
                if (isDarkNow) {
                    map.removeLayer(lightTile);
                    darkTile.addTo(map);
                } else {
                    map.removeLayer(darkTile);
                    lightTile.addTo(map);
                }
            }
        });
    });
    observer.observe(html, { attributes: true });
}
