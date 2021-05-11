class PostStatus:
    PENDING = 'PENDING'
    PROCESSING = 'PROCESSING'
    COMPLETED = 'COMPLETED'
    ERROR = 'ERROR'
    ARCHIVED = 'ARCHIVED'
    DELETING = 'DELETING'

    _ALL = (PENDING, COMPLETED, ERROR, ARCHIVED, DELETING)


class PostType:
    TEXT_ONLY = 'TEXT_ONLY'
    IMAGE = 'IMAGE'
    VIDEO = 'VIDEO'

    _ALL = (TEXT_ONLY, IMAGE, VIDEO)
