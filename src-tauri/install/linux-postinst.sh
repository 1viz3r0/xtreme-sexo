#!/bin/sh
set -eu
# Applied only by an administrator installing the DEB, never by the GUI.
# Only the capture-only helper receives CAP_NET_RAW; the GUI remains unprivileged.
if [ "${1:-configure}" = configure ]; then
    getent group netdev >/dev/null || groupadd --system netdev
    chown root:netdev /usr/lib/netoze/netoze-capture-helper
    chmod 0750 /usr/lib/netoze/netoze-capture-helper
    /usr/sbin/setcap cap_net_raw=ep /usr/lib/netoze/netoze-capture-helper
fi
