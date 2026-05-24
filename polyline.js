export function encodePolyline(points) {
    let lastLat = 0;
    let lastLng = 0;
    let str = "";
    function encodeValue(value) {
        value = value < 0 ? ~(value << 1) : (value << 1);
        while (value >= 0x20) {
            str += String.fromCharCode((0x20 | (value & 0x1f)) + 63);
            value >>= 5;
        }
        str += String.fromCharCode(value + 63);
    }
    for (let point of points) {
        let lat = Math.round(point[0] * 1e5);
        let lng = Math.round(point[1] * 1e5);
        encodeValue(lat - lastLat);
        encodeValue(lng - lastLng);
        lastLat = lat;
        lastLng = lng;
    }
    return str;
}

export function decodePolyline(encoded) {
    let points = [];
    let index = 0, lat = 0, lng = 0;
    while (index < encoded.length) {
        let b, shift = 0, result = 0;
        do {
            b = encoded.charCodeAt(index++) - 63;
            result |= (b & 0x1f) << shift;
            shift += 5;
        } while (b >= 0x20);
        let dlat = ((result & 1) ? ~(result >> 1) : (result >> 1));
        lat += dlat;
        shift = 0;
        result = 0;
        do {
            b = encoded.charCodeAt(index++) - 63;
            result |= (b & 0x1f) << shift;
            shift += 5;
        } while (b >= 0x20);
        let dlng = ((result & 1) ? ~(result >> 1) : (result >> 1));
        lng += dlng;
        points.push([lat / 1e5, lng / 1e5]);
    }
    return points;
}