import time
from typing import Any, Dict, List, Literal, Optional, Tuple, cast

from posthog.models import Action, Group, Organization, Person, PersonDistinctId, Team, User
from posthog.models.utils import UUIDT

from .matrix import Matrix
from .models import SimPerson


def save_sim_person(team_id: int, subject: SimPerson) -> Optional[Tuple[Person, List[PersonDistinctId]]]:
    if subject.first_seen_at is None:
        return  # Don't save a person who never participated
    from ee.clickhouse.models.event import create_event
    from ee.clickhouse.models.person import create_person, create_person_distinct_id

    person_uuid_str = str(UUIDT(unix_time_ms=int(subject.first_seen_at.timestamp() * 1000)))
    person = Person(team_id=team_id, properties=subject.properties, uuid=person_uuid_str)
    person_distinct_ids = [
        PersonDistinctId(team_id=team_id, person=person, distinct_id=distinct_id)
        for distinct_id in subject.distinct_ids
    ]
    create_person(
        uuid=person_uuid_str, team_id=team_id, properties=subject.properties,
    )
    for distinct_id in subject.distinct_ids:
        create_person_distinct_id(team_id=team_id, distinct_id=str(distinct_id), person_id=person_uuid_str)
    for event in subject.events:
        event_uuid = UUIDT(unix_time_ms=int(event.timestamp.timestamp() * 1000))
        create_event(
            event_uuid=event_uuid,
            event=event.event,
            team=team_id,
            distinct_id=event.properties["$distinct_id"],
            timestamp=event.timestamp,
            properties=event.properties,
        )
    return (person, person_distinct_ids)


def save_sim_group(team_id: int, type_index: Literal[0, 1, 2, 3, 4], key: str, properties: Dict[str, Any]) -> Group:
    from ee.clickhouse.models.group import create_group

    return create_group(team_id, type_index, key, properties)


class MatrixManager:
    @classmethod
    def create_team_and_run(cls, matrix: Matrix, organization: Organization, user: User, **kwargs) -> Team:
        team = Team.objects.create(
            organization=organization, ingested_event=True, completed_snippet_onboarding=True, is_demo=True, **kwargs
        )
        return cls.run_on_team(matrix, team, user)

    @classmethod
    def run_on_team(cls, matrix: Matrix, team: Team, user: User, simulate_journeys: bool = True) -> Team:
        set_time = time.time()  # FIXME
        matrix.set_project_up(team, user)
        print(f"[DEMO] Setting project up in {time.time() -set_time}")
        if simulate_journeys:
            persons_to_bulk_save: List[Person] = []
            person_distinct_ids_to_bulk_save: List[PersonDistinctId] = []
            matrix.simulate()
            simulation_time = time.time()  # FIXME
            for group_type_index, groups in enumerate(matrix.groups.values()):
                for group_key, group in groups.items():
                    save_sim_group(team.id, cast(Literal[0, 1, 2, 3, 4], group_type_index), group_key, group)
            sim_persons = matrix.people
            print(f"[DEMO] Simulated {len(sim_persons)} people in {time.time() - simulation_time}")
            individual_time = time.time()  # FIXME
            for sim_person in sim_persons:
                sim_person_save_result = save_sim_person(team.id, sim_person)
                if sim_person_save_result is not None:  # None is returned if the person wasn't ever seen
                    persons_to_bulk_save.append(sim_person_save_result[0])
                    for distinct_id in sim_person_save_result[1]:
                        person_distinct_ids_to_bulk_save.append(distinct_id)
            print(f"[DEMO] Saved (individual part) {len(sim_persons)} people in {time.time() - individual_time}")
            bulk_time = time.time()  # FIXME
            Person.objects.bulk_create(persons_to_bulk_save)
            PersonDistinctId.objects.bulk_create(person_distinct_ids_to_bulk_save)
            print(f"[DEMO] Saved (bulk part) {len(persons_to_bulk_save)} people in {time.time() - bulk_time}")
        team.save()
        for action in Action.objects.filter(team=team):
            action.calculate_events()
        return team
