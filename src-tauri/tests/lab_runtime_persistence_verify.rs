use netoze_desktop::services::lab_runtime::LabRuntimeState;

#[test]
fn lib_constructor_does_not_resume_old_checkpoints_or_simulated_rooms() {
    let state = LabRuntimeState::persistent();
    let status = state.status().unwrap();
    assert!(!status.running); assert!(!status.completed);
    assert_eq!(status.runtime, "docker"); assert_eq!(status.phase, "stopped");
    assert!(status.lab_id.is_none()); assert!(status.target_url.is_none());
}
