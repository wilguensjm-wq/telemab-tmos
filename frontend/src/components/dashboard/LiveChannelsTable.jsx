import EmptyTableRow from "../common/EmptyTableRow";

export default function LiveChannelsTable({ channels }) {
  return (
    <section className="panel">
      <div className="panel-title-row">
        <div>
          <h2 className="panel-title">On-Air Channels</h2>
          <p className="panel-caption">Program status, encoder health, and audience load</p>
        </div>
      </div>

      <table className="table">
        <thead>
          <tr>
            <th>Channel Name</th>
            <th>Status</th>
            <th>Resolution</th>
            <th>Bitrate</th>
            <th>Viewers</th>
          </tr>
        </thead>
        <tbody>
          {channels.length === 0 ? (
            <EmptyTableRow colSpan={5} message="Waiting for Provider" />
          ) : (
            channels.map((channel) => (
              <tr key={channel.name}>
                <td>{channel.name}</td>
                <td>
                  <span className={`status-pill ${channel.status.toLowerCase()}`}>
                    {channel.status}
                  </span>
                </td>
                <td>{channel.resolution}</td>
                <td>{channel.bitrate}</td>
                <td>{channel.viewers}</td>
              </tr>
            ))
          )}
        </tbody>
      </table>
    </section>
  );
}
