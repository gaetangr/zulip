import * as blueslip from "./blueslip";
import * as composebox_typeahead from "./composebox_typeahead";
import * as people from "./people";
import * as stream_pill from "./stream_pill";
import * as typeahead_helper from "./typeahead_helper";
import * as user_group_pill from "./user_group_pill";
import * as user_groups from "./user_groups";
import * as user_pill from "./user_pill";

function person_matcher(query, item) {
    if (people.is_known_user(item)) {
        return composebox_typeahead.query_matches_person(query, item);
    }
    return undefined;
}

function group_matcher(query, item) {
    if (user_groups.is_user_group(item)) {
        return composebox_typeahead.query_matches_name_description(query, item);
    }
    return undefined;
}

export function set_up(input, pills, opts) {
    if (!opts.user && !opts.user_group && !opts.stream) {
        blueslip.error("Unspecified possible item types");
        return;
    }
    const include_streams = (query) => opts.stream && query.trim().startsWith("#");
    const include_user_groups = opts.user_group;
    const include_users = opts.user;

    let user_source;
    if (opts.user_source) {
        user_source = opts.user_source;
    }

    input.typeahead({
        items: 5,
        fixed: true,
        dropup: true,
        source() {
            let source = [];
            if (include_streams(this.query)) {
                // If query starts with # we expect,
                // only stream suggestions so we simply
                // return stream source.
                return stream_pill.typeahead_source(pills);
            }

            if (include_user_groups) {
                source = source.concat(user_group_pill.typeahead_source(pills));
            }

            if (include_users) {
                if (user_source !== undefined) {
                    // If user_source is specified in opts, it
                    // is given priority. Otherwise we use
                    // default user_pill.typeahead_source.
                    source = source.concat(user_source());
                } else {
                    source = source.concat(user_pill.typeahead_source(pills));
                }
            }
            return source;
        },
        highlighter(item) {
            if (include_streams(this.query)) {
                return typeahead_helper.render_stream(item);
            }

            if (include_user_groups) {
                return typeahead_helper.render_person_or_user_group(item);
            }

            return typeahead_helper.render_person(item);
        },
        matcher(item) {
            let query = this.query.toLowerCase();
            query = query.replace(/\u00A0/g, String.fromCharCode(32));

            if (include_streams(query)) {
                query = query.trim().slice(1);
                return item.name.toLowerCase().includes(query);
            }

            if (include_user_groups) {
                return group_matcher(query, item) || person_matcher(query, item);
            }

            return person_matcher(query, item);
        },
        sorter(matches) {
            const query = this.query;
            if (include_streams(query)) {
                return typeahead_helper.sort_streams(matches, query.trim().slice(1));
            }

            const users = matches.filter((ele) => people.is_known_user(ele));
            let groups;
            if (include_user_groups) {
                groups = matches.filter((ele) => user_groups.is_user_group(ele));
            }
            return typeahead_helper.sort_recipients({
                users,
                query,
                current_stream: "",
                current_topic: undefined,
                groups,
                max_num_items: undefined,
            });
        },
        updater(item) {
            if (include_streams(this.query)) {
                stream_pill.append_stream(item, pills);
            } else if (include_user_groups && user_groups.is_user_group(item)) {
                user_group_pill.append_user_group(item, pills);
            } else {
                user_pill.append_user(item, pills);
            }

            input.trigger("focus");
            if (opts.update_func) {
                opts.update_func();
            }
        },
        stopAdvance: true,
    });
}
