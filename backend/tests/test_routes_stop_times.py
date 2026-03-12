from core.constants import ROUTES


def test_all_routes_have_valid_stop_times_mapping():
    """Для всех маршрутов время остановок должно покрывать каждую точку маршрута."""
    for route_id, route in ROUTES.items():
        stops = route.get("stops") or []
        stop_times = route.get("stop_times") or []
        assert stops, f"{route_id}: stops is empty"
        assert stop_times, f"{route_id}: stop_times is required"
        assert len(stop_times) == len(stops), (
            f"{route_id}: stop_times length ({len(stop_times)}) != stops length ({len(stops)})"
        )
        assert stop_times[0] == route.get("departure"), f"{route_id}: first stop time must match departure"
        assert stop_times[-1] == route.get("arrival"), f"{route_id}: last stop time must match arrival"
